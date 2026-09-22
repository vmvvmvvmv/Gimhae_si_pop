"""VWorld 개발 관련 구역을 김해시 지도용 GeoJSON으로 저장합니다.

이 파일은 법적으로 지정·고시된 공간정보만 다룹니다. 단순 검토 단계의
개발 예정지는 김해시 UPIS 고시 자료와 별도로 검증한 뒤 추가해야 합니다.
"""

import argparse
import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from shapely.geometry import GeometryCollection, mapping, shape
from shapely.ops import unary_union

from .core.config import (
    ADMIN_GEOJSON_PATH,
    PROJECT_ROOT,
    VWORLD_API_DOMAIN,
    VWORLD_API_KEY,
)


VWORLD_WFS_URL = "https://api.vworld.kr/req/wfs"
DEFAULT_BBOX = "128.65,35.10,129.05,35.40"
DEFAULT_OUTPUT = (
    PROJECT_ROOT / "public" / "data" / "gimhae_development_areas.geojson"
)

# 화면에 보여줄 분류와 VWorld 원본 레이어를 한곳에서 관리합니다.
# 레이어가 추가되더라도 동기화 로직과 화면 코드를 고칠 필요가 없습니다.
DEVELOPMENT_LAYERS: tuple[dict[str, str], ...] = (
    {
        "source_layer": "lt_c_damdan",
        "category": "INDUSTRIAL_COMPLEX",
        "category_label": "산업단지",
    },
    {
        "source_layer": "lt_c_upisuq161",
        "category": "DISTRICT_PLAN",
        "category_label": "지구단위계획",
    },
    {
        "source_layer": "lt_c_lhzone",
        "category": "PUBLIC_DEVELOPMENT",
        "category_label": "공공 개발사업",
    },
    {
        "source_layer": "lt_c_uq129",
        "category": "DEVELOPMENT_PROMOTION",
        "category_label": "개발진흥지구",
    },
)

NAME_KEYS = (
    "dan_name",
    "dan_nm",
    "zonename",
    "zone_name",
    "zone_nm",
    "pmi_nam",
    "exc_nam",
    "alias",
    "remark",
    "dgm_nm",
    "uname",
    "name",
    "biz_name",
    "biz_nm",
    "district_name",
)


def load_gimhae_boundary():
    collection = json.loads(ADMIN_GEOJSON_PATH.read_text(encoding="utf-8"))
    geometries = [
        shape(feature["geometry"])
        for feature in collection.get("features", [])
        if feature.get("geometry")
    ]
    if not geometries:
        raise RuntimeError("김해시 행정동 경계 GeoJSON이 비어 있습니다.")
    return unary_union(geometries)


def polygonal_geometry(geometry):
    if geometry.geom_type in {"Polygon", "MultiPolygon"}:
        return geometry
    if isinstance(geometry, GeometryCollection):
        polygons = [
            part
            for part in geometry.geoms
            if part.geom_type in {"Polygon", "MultiPolygon"}
        ]
        return unary_union(polygons) if polygons else None
    return None


def first_text(properties: dict[str, Any], keys: tuple[str, ...]) -> str:
    normalized = {str(key).lower(): value for key, value in properties.items()}
    for key in keys:
        value = normalized.get(key.lower())
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def get_feature_name(
    properties: dict[str, Any],
    layer: dict[str, str],
) -> str:
    if layer["category"] == "DEVELOPMENT_PROMOTION":
        # alias/remark는 공원·도로·주거용지 같은 지구 내부 용도명이라
        # 개발사업 이름으로 사용하면 잘못된 고시와 연결될 수 있습니다.
        return first_text(properties, ("uname", "dgm_nm"))
    return first_text(properties, NAME_KEYS)


def normalize_features(
    payload: dict[str, Any],
    layer: dict[str, str],
    gimhae_boundary,
    fetched_at: str,
) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for index, feature in enumerate(payload.get("features", []), start=1):
        geometry = feature.get("geometry")
        if not isinstance(geometry, dict):
            continue

        clipped = polygonal_geometry(shape(geometry).intersection(gimhae_boundary))
        if clipped is None or clipped.is_empty:
            continue

        properties = feature.get("properties") or {}
        name = get_feature_name(properties, layer) or layer["category_label"]
        notice_source_id = first_text(properties, ("ntfc_sn",))
        area_source_id = str(
            feature.get("id")
            or first_text(
                properties,
                ("dan_id", "zonecode", "present_sn", "mnum"),
            )
            or f"{layer['category']}-{index}"
        )
        normalized.append(
            {
                "type": "Feature",
                "id": area_source_id,
                "properties": {
                    "__layer": "development-area",
                    "areaSourceId": area_source_id,
                    "noticeSourceId": notice_source_id,
                    "category": layer["category"],
                    "categoryLabel": layer["category_label"],
                    "name": name,
                    "stage": "DESIGNATED",
                    "stageLabel": "공식 지정·고시 구역",
                    "source": "VWORLD",
                    "sourceLayer": layer["source_layer"].upper(),
                    "fetchedAt": fetched_at,
                },
                "geometry": mapping(clipped),
            }
        )
    return normalized


async def fetch_layer(
    client: httpx.AsyncClient,
    layer: dict[str, str],
    bbox: str,
    gimhae_boundary,
    fetched_at: str,
) -> list[dict[str, Any]]:
    params = {
        "service": "WFS",
        "version": "1.1.0",
        "request": "GetFeature",
        "typename": layer["source_layer"],
        "output": "application/json",
        "srsname": "EPSG:4326",
        "bbox": bbox,
        # VWorld WFS의 단일 요청 상한은 1,000건입니다. 김해시 범위에서는
        # 각 개발 관련 레이어가 이 상한보다 작아 한 번의 요청으로 충분합니다.
        "maxfeatures": 1000,
        "key": VWORLD_API_KEY,
        "domain": VWORLD_API_DOMAIN,
    }
    response = await client.get(VWORLD_WFS_URL, params=params)
    response.raise_for_status()

    try:
        payload = response.json()
    except ValueError as error:
        response_preview = " ".join(response.text[:1000].split())
        raise RuntimeError(
            f"{layer['category_label']} 응답이 JSON 형식이 아닙니다. "
            f"응답: {response_preview}"
        ) from error

    if payload.get("type") != "FeatureCollection":
        message = payload.get("message") or payload.get("error") or "알 수 없는 오류"
        raise RuntimeError(f"{layer['category_label']} 조회 실패: {message}")

    return normalize_features(
        payload,
        layer,
        gimhae_boundary,
        fetched_at,
    )


async def download_development_areas(bbox: str) -> dict[str, Any]:
    if not VWORLD_API_KEY:
        raise RuntimeError(".env에 VWORLD_API_KEY를 설정해주세요.")

    gimhae_boundary = load_gimhae_boundary()
    fetched_at = datetime.now(UTC).isoformat()
    features: list[dict[str, Any]] = []
    errors: list[str] = []

    async with httpx.AsyncClient(timeout=90.0) as client:
        for layer in DEVELOPMENT_LAYERS:
            try:
                layer_features = await fetch_layer(
                    client,
                    layer,
                    bbox,
                    gimhae_boundary,
                    fetched_at,
                )
                features.extend(layer_features)
                print(
                    f"조회 완료 - {layer['category_label']}: "
                    f"{len(layer_features)}개"
                )
            except (httpx.HTTPError, RuntimeError) as error:
                errors.append(f"{layer['category_label']}: {error}")
                print(f"조회 실패 - {layer['category_label']}: {error}")

    if not features and errors:
        raise RuntimeError("개발 관련 구역을 한 건도 가져오지 못했습니다.")

    return {
        "type": "FeatureCollection",
        "name": "Gimhae designated development areas",
        "crs": {
            "type": "name",
            "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"},
        },
        "metadata": {
            "source": "VWORLD",
            "fetchedAt": fetched_at,
            "scope": "공식 지정·고시 구역",
            "failedLayers": errors,
        },
        "features": features,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bbox", default=DEFAULT_BBOX)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    collection = asyncio.run(download_development_areas(args.bbox))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(collection, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"VWorld 개발 관련 구역 동기화 완료: {len(collection['features'])}개")
    print(f"저장 위치: {args.output}")


if __name__ == "__main__":
    main()
