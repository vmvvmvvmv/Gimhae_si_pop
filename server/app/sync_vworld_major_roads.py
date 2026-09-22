"""VWorld 도로중심선 중 차로 수 속성이 6 이상인 김해 도로를 저장합니다."""

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from shapely.geometry import LineString, MultiLineString, shape
from shapely.ops import unary_union

from .core.config import ADMIN_GEOJSON_PATH, PROJECT_ROOT, VWORLD_API_DOMAIN, VWORLD_API_KEY


WFS_URL = "https://api.vworld.kr/req/wfs"
LAYER = "lt_l_n3a0020000"
BBOX = (128.65, 35.10, 129.05, 35.40)
OUTPUT = PROJECT_ROOT / "public" / "data" / "gimhae_major_roads.geojson"
MAX_FEATURES = 1000


def road_filter(bbox: tuple[float, float, float, float]) -> str:
    west, south, east, north = bbox
    # WFS 1.1.0의 EPSG:4326 Envelope은 위도·경도 순서입니다.
    return (
        "<Filter><And><BBOX><PropertyName>ag_geom</PropertyName>"
        f"<Envelope><lowerCorner>{south} {west}</lowerCorner>"
        f"<upperCorner>{north} {east}</upperCorner></Envelope></BBOX>"
        "<PropertyIsGreaterThanOrEqualTo><PropertyName>rdln</PropertyName>"
        "<Literal>6</Literal></PropertyIsGreaterThanOrEqualTo>"
        "</And></Filter>"
    )


async def fetch_box(
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    bbox: tuple[float, float, float, float],
    depth: int = 0,
) -> list[dict[str, Any]]:
    if depth > 12:
        raise RuntimeError("도로 조회 영역을 충분히 나눌 수 없습니다.")

    params = {
        "service": "WFS",
        "version": "1.1.0",
        "request": "GetFeature",
        "typename": LAYER,
        "output": "application/json",
        "srsname": "EPSG:4326",
        "filter": road_filter(bbox),
        "maxfeatures": MAX_FEATURES,
        "key": VWORLD_API_KEY,
        "domain": VWORLD_API_DOMAIN,
    }
    async with semaphore:
        for attempt in range(3):
            try:
                response = await client.get(WFS_URL, params=params)
                if response.status_code != 200:
                    raise RuntimeError(f"VWorld HTTP {response.status_code}")
                payload = response.json()
                break
            except (httpx.HTTPError, ValueError, RuntimeError) as error:
                if attempt == 2:
                    # 예외 URL에 인증키가 포함되지 않도록 종류만 전달합니다.
                    raise RuntimeError(
                        f"VWorld 도로 조회 실패: {type(error).__name__}"
                    ) from None
                await asyncio.sleep(1.5 * (attempt + 1))

    if payload.get("type") != "FeatureCollection":
        raise RuntimeError("VWorld 도로 응답이 GeoJSON이 아닙니다.")
    total = int(payload.get("totalFeatures") or 0)
    features = payload.get("features") or []
    if total < MAX_FEATURES:
        return features

    west, south, east, north = bbox
    middle_x = (west + east) / 2
    middle_y = (south + north) / 2
    quarters = (
        (west, south, middle_x, middle_y),
        (middle_x, south, east, middle_y),
        (west, middle_y, middle_x, north),
        (middle_x, middle_y, east, north),
    )
    results = await asyncio.gather(
        *(fetch_box(client, semaphore, quarter, depth + 1) for quarter in quarters)
    )
    return [feature for result in results for feature in result]


def iter_lines(geometry: Any):
    if geometry.is_empty:
        return
    if geometry.geom_type == "LineString":
        yield geometry
    elif geometry.geom_type in {"MultiLineString", "GeometryCollection"}:
        for part in geometry.geoms:
            yield from iter_lines(part)


def make_collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    boundary_data = json.loads(ADMIN_GEOJSON_PATH.read_text(encoding="utf-8"))
    city = unary_union(
        [shape(feature["geometry"]) for feature in boundary_data["features"]]
    )
    by_class: dict[str, list[LineString]] = {"six_to_seven": [], "eight_plus": []}
    seen: set[str] = set()

    for feature in features:
        properties = feature.get("properties") or {}
        identifier = str(properties.get("ufid") or feature.get("id") or "")
        if not identifier or identifier in seen or not feature.get("geometry"):
            continue
        seen.add(identifier)
        lanes = int(properties.get("rdln") or 0)
        if lanes < 6:
            continue
        clipped = shape(feature["geometry"]).intersection(city)
        lane_class = "eight_plus" if lanes >= 8 else "six_to_seven"
        by_class[lane_class].extend(
            line for line in iter_lines(clipped) if line.length > 0
        )

    output_features: list[dict[str, Any]] = []
    for lane_class, lines in by_class.items():
        if not lines:
            continue
        geometry = MultiLineString([list(line.coords) for line in lines])
        output_features.append(
            {
                "type": "Feature",
                "properties": {
                    "__layer": "major-road",
                    "laneClass": lane_class,
                    "minLaneCount": 8 if lane_class == "eight_plus" else 6,
                    "segmentCount": len(lines),
                    "source": "VWORLD_NGII_ROAD_CENTERLINE",
                },
                "geometry": geometry.__geo_interface__,
            }
        )

    if not output_features:
        raise RuntimeError("김해시 안의 6차로 이상 도로가 조회되지 않았습니다.")

    return {
        "type": "FeatureCollection",
        "name": "Gimhae major road centerlines",
        "metadata": {
            "source": "VWorld 국토지리정보원 도로중심선 LT_L_N3A0020000",
            "selection": "rdln >= 6, 김해시 행정경계로 자름",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "uniqueSourceSegments": len(seen),
        },
        "features": output_features,
    }


async def main() -> None:
    if not VWORLD_API_KEY:
        raise RuntimeError(".env에 VWORLD_API_KEY가 필요합니다.")
    async with httpx.AsyncClient(timeout=60.0) as client:
        features = await fetch_box(client, asyncio.Semaphore(3), BBOX)
    collection = make_collection(features)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(collection, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(
        "주요 도로 저장 완료:",
        collection["metadata"]["uniqueSourceSegments"],
        "원본 선분,",
        sum(item["properties"]["segmentCount"] for item in collection["features"]),
        "표시 선분",
    )
    print("저장 위치:", OUTPUT)


if __name__ == "__main__":
    asyncio.run(main())
