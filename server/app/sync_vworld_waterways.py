"""VWorld 하천망을 김해시 지도용 GeoJSON 파일로 저장합니다."""

import argparse
import asyncio
import json
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
WATERWAY_LAYER = "lt_c_wkmstrm"
DEFAULT_BBOX = "128.65,35.10,129.05,35.40"
DEFAULT_OUTPUT = PROJECT_ROOT / "public" / "data" / "gimhae_waterways.geojson"


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


def normalize_collection(payload: dict[str, Any]) -> dict[str, Any]:
    gimhae_boundary = load_gimhae_boundary()
    features: list[dict[str, Any]] = []
    for index, feature in enumerate(payload.get("features", []), start=1):
        geometry = feature.get("geometry")
        if not isinstance(geometry, dict):
            continue

        clipped = polygonal_geometry(shape(geometry).intersection(gimhae_boundary))
        if clipped is None or clipped.is_empty:
            continue

        properties = feature.get("properties") or {}
        features.append(
            {
                "type": "Feature",
                "id": feature.get("id") or f"waterway-{index}",
                "properties": {
                    "__layer": "waterway",
                    "riverCode": str(properties.get("riv_cd") or ""),
                    "source": "VWORLD",
                },
                "geometry": mapping(clipped),
            }
        )

    return {
        "type": "FeatureCollection",
        "name": "Gimhae waterways",
        "crs": {
            "type": "name",
            "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"},
        },
        "features": features,
    }


async def download_waterways(bbox: str) -> dict[str, Any]:
    if not VWORLD_API_KEY:
        raise RuntimeError(".env에 VWORLD_API_KEY를 설정해주세요.")

    params = {
        "service": "WFS",
        "version": "1.1.0",
        "request": "GetFeature",
        "typename": WATERWAY_LAYER,
        "output": "application/json",
        "srsname": "EPSG:4326",
        "bbox": bbox,
        "maxfeatures": 1000,
        "key": VWORLD_API_KEY,
        "domain": VWORLD_API_DOMAIN,
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(VWORLD_WFS_URL, params=params)
        response.raise_for_status()
        payload = response.json()

    if payload.get("type") != "FeatureCollection":
        raise RuntimeError("VWorld 하천망 응답이 GeoJSON 형식이 아닙니다.")
    return normalize_collection(payload)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bbox", default=DEFAULT_BBOX)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    collection = asyncio.run(download_waterways(args.bbox))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(collection, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"VWorld 하천망 동기화 완료: {len(collection['features'])}개 구역")
    print(f"저장 위치: {args.output}")


if __name__ == "__main__":
    main()
