"""VWorld 장소 검색 결과를 지도용 시설 테이블에 저장합니다."""

import argparse
import asyncio
from typing import Any

import httpx
from sqlalchemy import select

from .core.config import VWORLD_API_DOMAIN, VWORLD_API_KEY
from .core.time import utc_now
from .db import Base, SessionLocal, engine
from .facility_quality import (
    deduplicate_facilities,
    deduplicate_nearby_parks,
    deduplicate_nearby_schools,
    display_facility_name,
    is_human_medical_facility,
    is_distinct_school,
    is_likely_bridge,
    is_market_or_major_mart,
    is_passenger_transit,
)
from .models import Region
from .repositories.facility_repository import upsert_facilities


VWORLD_SEARCH_URL = "https://api.vworld.kr/req/search"
GIMHAE_BBOX = "128.65,35.10,129.05,35.40"
CATEGORY_QUERIES = {
    "ADMIN_CENTER": (
        "김해시 행정복지센터",
        "김해시 읍사무소",
        "김해시 면사무소",
    ),
    "HOSPITAL": (
        "김해시 종합병원",
        "김해시 대학병원",
        "김해시 보건소",
    ),
    "SCHOOL": (
        "김해시 초등학교",
        "김해시 중학교",
        "김해시 고등학교",
    ),
    "UNIVERSITY": (
        "김해시 대학교",
        "김해시 대학",
    ),
    "TRANSIT": (
        "김해시 경전철역",
        "김해시 기차역",
        "김해시 버스터미널",
        # 광역 검색에서 빠지는 역을 정확한 이름으로 한 번 더 조회합니다.
        "김해시 불암역",
        "김해시청역",
        "김해시 진영역",
    ),
    "BRIDGE": (
        "김해시 교량",
        "김해시 다리",
        "김해시 대교",
    ),
    "PARK": (
        "김해시 도시공원",
        "김해시 근린공원",
        "김해시 공원",
    ),
    "MARKET": (
        "김해시 전통시장",
        "김해시 동상시장",
        "김해시 삼방시장",
        "김해시 장유중앙시장",
        "김해시 대형마트",
        "김해시 롯데마트",
        "김해시 이마트",
        "김해시 홈플러스",
        "김해시 하나로마트",
    ),
}
ADMIN_CENTER_TERMS = ("행정복지센터", "읍사무소", "면사무소")
ADMIN_CENTER_EXCLUDED_TERMS = (
    "주차장",
    "입구",
    "공중화장실",
    "주민자치센터",
    "전기차",
    "체육",
    "민원",
    "출장소",
)
CATEGORY_REQUIRED_TERMS = {
    "HOSPITAL": ("병원", "의료원", "보건소"),
    "SCHOOL": ("초등학교", "중학교", "고등학교"),
    "UNIVERSITY": ("대학교", "대학"),
    "TRANSIT": ("역", "터미널"),
    "MARKET": ("시장", "마트"),
    "PARK": ("공원",),
}
CATEGORY_EXCLUDED_TERMS = {
    "HOSPITAL": (
        "주차장", "장례식장", "약국", "동물병원", "입구",
        "버스정류장", "정류장", "편의점", "CU", "GS25", "세븐일레븐",
    ),
    "SCHOOL": (
        "주차장", "병설유치원", "총동창회", "입구", "정문", "후문",
        "버스정류장", "정류장", "체육관",
    ),
    "UNIVERSITY": (
        "주차장", "기숙사", "산학협력단", "병원", "입구", "정류장",
    ),
    "TRANSIT": ("주차장", "정류장", "화장실", "입구"),
    "BRIDGE": (
        "학교", "교회", "교차로", "정류장", "주차장", "아파트",
        "공원", "마을", "입구",
    ),
    "MARKET": ("주차장", "화장실", "정류장", "입구"),
    "PARK": (
        "주차장", "화장실", "정류장", "입구", "관리사무소",
        "어린이집", "아파트",
    ),
}
CATEGORY_ALLOWED_ENDINGS = {
    "HOSPITAL": ("병원", "의료원", "보건소"),
    "SCHOOL": ("초등학교", "중학교", "고등학교"),
    "UNIVERSITY": ("대학교", "대학", "캠퍼스"),
    "TRANSIT": ("역", "터미널"),
    "BRIDGE": ("교", "대교", "교량", "다리"),
    "PARK": ("공원",),
}
UNIVERSITY_CANONICAL_NAMES = (
    "가야대학교",
    "김해대학교",
    "부산장신대학교",
    "인제대학교",
    "한국방송통신대학교",
)

# 부산김해경전철 운영사 노선도 기준 김해 소재 12개 역과 현 진영역.
# https://www.bglrt.com/00014/00161/00162.web
# https://www.data.go.kr/data/15034533/standard.do
REQUIRED_TRANSIT_STATIONS = frozenset({
    "불암역", "지내역", "김해대학역", "인제대(활천)역",
    "김해시청역", "부원역", "봉황역", "수로왕릉역",
    "박물관역", "연지공원역", "장신대역", "가야대역",
    "진영역",
})
TRANSIT_ADDRESS_HINTS = {
    "불암역": "김해대로 2787",
    "김해시청역": "김해대로 2408",
    "진영역": "설창리 131-1",
}


def transit_address_score(facility: dict[str, object]) -> int:
    name = compact_text(str(facility["name"]))
    hint = TRANSIT_ADDRESS_HINTS.get(name)
    if not hint:
        return 0
    address = " ".join(
        str(facility.get(key) or "")
        for key in ("road_address", "parcel_address")
    )
    return int(hint in address)


def extract_items(payload: dict[str, Any]) -> list[dict[str, Any]]:
    api_response = payload.get("response", {})
    if api_response.get("status") == "NOT_FOUND":
        return []
    if api_response.get("status") != "OK":
        error = api_response.get("error", {})
        code = str(error.get("code") or "UNKNOWN_ERROR")
        text = str(error.get("text") or "알 수 없는 오류")
        guidance = {
            "INVALID_KEY": "VWorld에서 발급한 API KEY 전체 값을 확인해주세요.",
            "INCORRECT_KEY": "VWorld 등록 도메인과 VWORLD_API_DOMAIN을 확인해주세요.",
            "OVER_REQUEST_LIMIT": "일일 VWorld 호출 한도를 초과했습니다.",
        }.get(code, text)
        raise RuntimeError(f"VWorld 시설 검색 실패 [{code}]: {guidance}")

    items = api_response.get("result", {}).get("items", [])
    if isinstance(items, dict):
        items = items.get("item", [])
    if isinstance(items, dict):
        return [items]
    return items if isinstance(items, list) else []


async def search_places(query: str) -> list[dict[str, Any]]:
    if not VWORLD_API_KEY:
        raise RuntimeError(".env에 VWORLD_API_KEY를 설정해주세요.")

    results: list[dict[str, Any]] = []
    page = 1
    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            response = await client.get(
                VWORLD_SEARCH_URL,
                params={
                    "service": "search",
                    "version": "2.0",
                    "request": "search",
                    "format": "json",
                    "size": 100,
                    "page": page,
                    "query": query,
                    "type": "PLACE",
                    "bbox": GIMHAE_BBOX,
                    "crs": "EPSG:4326",
                    "key": VWORLD_API_KEY,
                    "domain": VWORLD_API_DOMAIN,
                },
            )
            response.raise_for_status()
            payload = response.json()
            page_items = extract_items(payload)
            results.extend(page_items)

            page_info = payload.get("response", {}).get("page", {})
            total_pages = int(page_info.get("total") or 1)
            if not page_items or page >= total_pages:
                break
            page += 1

    return results


def normalize_items(items: list[dict[str, Any]]) -> list[dict[str, object]]:
    normalized: dict[str, dict[str, object]] = {}
    for item in items:
        point = item.get("point") or {}
        try:
            longitude = float(point.get("x"))
            latitude = float(point.get("y"))
        except (TypeError, ValueError):
            continue

        name = str(item.get("title") or "").strip()
        if not name:
            continue

        address = item.get("address") or {}
        road_address = str(address.get("road") or "").strip()
        parcel_address = str(address.get("parcel") or "").strip()
        if "김해시" not in f"{name} {road_address} {parcel_address}":
            continue

        source_id = str(item.get("id") or f"{name}:{longitude}:{latitude}")
        normalized[source_id] = {
            "source_id": source_id,
            "name": name,
            "latitude": latitude,
            "longitude": longitude,
            "road_address": road_address,
            "parcel_address": parcel_address,
            "phone": None,
            "fetched_at": utc_now(),
        }
    return list(normalized.values())


def compact_text(value: str) -> str:
    return "".join(value.split()).replace("·", "")


def admin_center_score(
    region_name: str,
    facility: dict[str, object],
) -> int:
    short_region_name = compact_text(region_name.split()[-1])
    facility_name = compact_text(str(facility["name"]))
    if short_region_name not in facility_name:
        return -1
    if not any(term in facility_name for term in ADMIN_CENTER_TERMS):
        return -1

    canonical_name = f"{short_region_name}행정복지센터"
    score = 100 if facility_name == canonical_name else 60
    if facility_name in {
        f"{short_region_name}읍사무소",
        f"{short_region_name}면사무소",
    }:
        score = 90
    if facility.get("road_address"):
        score += 10
    score -= sum(
        30 for term in ADMIN_CENTER_EXCLUDED_TERMS if term in facility_name
    )
    return score


def select_admin_centers(
    facilities: list[dict[str, object]],
) -> list[dict[str, object]]:
    with SessionLocal() as db:
        regions = db.scalars(
            select(Region)
            .where(
                Region.level == "admin",
                Region.is_active.is_(True),
            )
            .order_by(Region.region_code),
        ).all()

    selected: list[dict[str, object]] = []
    missing_regions: list[str] = []
    for region in regions:
        candidates = [
            facility
            for facility in facilities
            if admin_center_score(region.region_name, facility) >= 0
        ]
        if not candidates:
            missing_regions.append(region.region_name.split()[-1])
            continue

        best = max(
            candidates,
            key=lambda facility: admin_center_score(
                region.region_name,
                facility,
            ),
        ).copy()
        # VWorld에 중복 POI가 있어도 행정동 코드당 하나만 저장합니다.
        best["source_id"] = region.region_code
        selected.append(best)

    print(f"행정구역 기준 대표 센터 선택: {len(selected)}/{len(regions)}개")
    if missing_regions:
        print(f"검색되지 않은 지역: {', '.join(missing_regions)}")
    return selected


def filter_category_facilities(
    category: str,
    facilities: list[dict[str, object]],
) -> list[dict[str, object]]:
    """검색어 주변 부가 POI를 제외하고 시설 자체만 남깁니다."""
    required_terms = CATEGORY_REQUIRED_TERMS.get(category, ())
    excluded_terms = CATEGORY_EXCLUDED_TERMS.get(category, ())
    allowed_endings = CATEGORY_ALLOWED_ENDINGS.get(category, ())
    selected: dict[str, dict[str, object]] = {}

    for facility in facilities:
        name = compact_text(str(facility["name"]))
        if category == "MARKET" and not is_market_or_major_mart(name):
            continue
        if category == "BRIDGE" and not is_likely_bridge(name):
            continue
        if category == "BRIDGE" and name in {"교", "교량", "다리", "대교"}:
            continue
        if category == "HOSPITAL" and not is_human_medical_facility(name):
            continue
        if category == "SCHOOL" and not is_distinct_school(name):
            continue
        if category == "TRANSIT" and not is_passenger_transit(name):
            continue
        if required_terms and not any(term in name for term in required_terms):
            continue
        if any(term in name for term in excluded_terms):
            continue
        if allowed_endings and not name.endswith(allowed_endings):
            continue

        canonical_name = name
        if category == "UNIVERSITY":
            canonical_name = next(
                (
                    university_name
                    for university_name in UNIVERSITY_CANONICAL_NAMES
                    if university_name in name
                ),
                "",
            )
            if not canonical_name:
                continue

        # VWorld에는 같은 시설이 여러 POI ID·좌표로 중복될 수 있습니다.
        # 김해시 안에서 같은 정규화 명칭은 대표 좌표 하나만 유지합니다.
        existing = selected.get(canonical_name)
        if existing is None or (
            category == "TRANSIT"
            and transit_address_score(facility) > transit_address_score(existing)
        ) or (
            category != "TRANSIT"
            and len(name) < len(compact_text(str(existing["name"])))
        ):
            selected[canonical_name] = facility

    result = list(selected.values())
    if category == "HOSPITAL":
        return deduplicate_facilities(category, result)
    if category == "PARK":
        return deduplicate_nearby_parks(result)
    if category == "SCHOOL":
        return deduplicate_nearby_schools(result)
    return result


def validate_transit_coverage(facilities: list[dict[str, object]]) -> None:
    names = {
        display_facility_name("TRANSIT", str(facility["name"]))
        for facility in facilities
    }
    missing = REQUIRED_TRANSIT_STATIONS - names
    if missing:
        raise RuntimeError(
            "공식 노선·역 목록과 비교해 누락된 교통거점: "
            + ", ".join(sorted(missing))
        )


async def collect_category(category: str) -> list[dict[str, object]]:
    queries = CATEGORY_QUERIES[category]
    raw_items: list[dict[str, Any]] = []
    for query in queries:
        query_items = await search_places(query)
        print(f"검색 완료 - {query}: {len(query_items)}개")
        raw_items.extend(query_items)
    normalized = normalize_items(raw_items)
    if category == "ADMIN_CENTER":
        return select_admin_centers(normalized)
    selected = filter_category_facilities(category, normalized)
    if category == "TRANSIT":
        validate_transit_coverage(selected)
    return selected


async def sync_categories(categories: tuple[str, ...]) -> None:
    Base.metadata.create_all(bind=engine)
    for category in categories:
        facilities = await collect_category(category)
        with SessionLocal() as db:
            count = upsert_facilities(
                db,
                facilities,
                source="VWORLD",
                category=category,
            )
        print(f"VWorld 시설 동기화 완료 - {category}: {count}개")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--category",
        choices=(*CATEGORY_QUERIES, "ALL"),
        default="ADMIN_CENTER",
    )
    args = parser.parse_args()

    categories = (
        tuple(CATEGORY_QUERIES)
        if args.category == "ALL"
        else (args.category,)
    )
    asyncio.run(sync_categories(categories))


if __name__ == "__main__":
    main()
