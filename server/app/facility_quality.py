"""수집 시점과 조회 시점에 공통으로 적용하는 시설 POI 품질 기준."""

from typing import Any
from math import cos, radians, hypot

MARKET_NAMES = frozenset({
    "동상시장",
    "삼방시장",
    "장유중앙시장",
    "진례전통시장",
    "진영전통시장",
})

MART_NAMES = frozenset({
    "롯데마트김해점",
    "롯데마트장유점",
    "하나로마트",
    "하나로마트김해점",
    "하나로마트상동농협매리지점",
})


def is_market_or_major_mart(name: str) -> bool:
    """검색어가 상호 일부에 포함된 음식점·점포는 제외합니다."""
    compact = "".join(name.split()).replace("·", "")
    return compact in MARKET_NAMES or compact in MART_NAMES


def is_likely_bridge(name: str) -> bool:
    """'코다리'·'투다리' 같은 음식점은 교량으로 표시하지 않습니다."""
    compact = "".join(name.split()).replace("·", "")
    return len(compact) > 2 and compact.endswith(("교", "출렁다리"))


def is_human_medical_facility(name: str) -> bool:
    """동물병원 등 검색어만 일치한 POI는 의료시설에서 제외합니다."""
    compact = "".join(name.split()).replace("·", "")
    return (
        compact.endswith(("병원", "의료원", "보건소"))
        and not any(term in compact for term in ("동물", "수의", "펫"))
    )


HOSPITAL_ALIASES = (
    "갑을장유병원",
    "조은금강병원",
    "희망나무종합병원",
    "김해시보건소",
)

# VWorld의 교통 검색에는 역사 안 상점·버스정류장도 섞입니다.
PASSENGER_TRANSIT_NAMES = frozenset({
    "불암역", "지내역", "김해대학역", "활천역", "인제대(활천)역",
    "김해시청역", "부원역", "봉황역", "수로왕릉역",
    "박물관역", "연지공원역", "장신대역", "가야대역",
    "진영역", "진례역", "한림정역",
    "김해여객터미널", "장유여객터미널", "진영시외버스터미널",
})


def is_passenger_transit(name: str) -> bool:
    return "".join(name.split()) in PASSENGER_TRANSIT_NAMES

# 경남교육청 학교 목록에는 초·중학교가 각각 등재되어 있습니다.
# VWorld의 합쳐진 캠퍼스 표기와 중복 별칭은 별도 학교로 표시하지 않습니다.
REDUNDANT_SCHOOL_NAMES = frozenset({
    "진영장등초중학교",
    "진영초중학교",
    "수남고등학교",
})


def is_distinct_school(name: str) -> bool:
    return "".join(name.split()) not in REDUNDANT_SCHOOL_NAMES


def display_facility_name(category: str, name: str) -> str:
    # 부산김해경전철 운영사 역정보의 공식 표기입니다.
    if category == "TRANSIT" and "".join(name.split()) == "활천역":
        return "인제대(활천)역"
    return name


def facility_identity(category: str, name: str) -> str:
    """법인명 접두어 등이 달라도 같은 시설이면 같은 표시 키를 사용합니다."""
    compact = "".join(name.split()).replace("·", "")
    if category == "HOSPITAL":
        if compact == "김해보건소":
            return "김해시보건소"
        for canonical in HOSPITAL_ALIASES:
            if compact.endswith(canonical):
                return canonical
    return compact


def deduplicate_facilities(
    category: str,
    facilities: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """명칭이 중복된 POI는 주소가 있는 대표 항목 하나만 반환합니다."""
    selected: dict[str, dict[str, Any]] = {}
    for facility in facilities:
        name = str(facility["name"])
        key = facility_identity(category, name)
        previous = selected.get(key)
        if previous is None:
            selected[key] = facility
            continue
        def priority(item: dict[str, Any]) -> tuple[int, int, int]:
            return (
                int(bool(item.get("road_address") or item.get("roadAddress"))),
                int("의료법인" not in str(item["name"]) and "재단" not in str(item["name"])),
                -len(str(item["name"])),
            )
        if priority(facility) > priority(previous):
            selected[key] = facility
    return list(selected.values())


def deduplicate_nearby_parks(
    facilities: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """대소문자만 다른 같은 이름의 30m 이내 공원 POI를 하나로 표시합니다."""
    selected: list[dict[str, Any]] = []
    for facility in facilities:
        name = "".join(str(facility["name"]).split()).casefold()
        latitude = float(facility["latitude"])
        longitude = float(facility["longitude"])
        duplicate = next((
            index for index, previous in enumerate(selected)
            if "".join(str(previous["name"]).split()).casefold() == name
            and hypot(
                (latitude - float(previous["latitude"])) * 111_000,
                (longitude - float(previous["longitude"]))
                * 111_000 * cos(radians(latitude)),
            ) < 30
        ), None)
        if duplicate is None:
            selected.append(facility)
        elif (
            facility.get("road_address") or facility.get("roadAddress")
        ) and not (
            selected[duplicate].get("road_address")
            or selected[duplicate].get("roadAddress")
        ):
            selected[duplicate] = facility
    return selected


def deduplicate_nearby_schools(
    facilities: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """접두 지명만 다른 학교 POI가 가까이 있으면 대표 지점 하나를 고릅니다."""
    selected: list[dict[str, Any]] = []
    for facility in facilities:
        name = "".join(str(facility["name"]).split())
        latitude = float(facility["latitude"])
        longitude = float(facility["longitude"])
        duplicate = next((
            index for index, previous in enumerate(selected)
            if (
                name.endswith("".join(str(previous["name"]).split()))
                or "".join(str(previous["name"]).split()).endswith(name)
            )
            and hypot(
                (latitude - float(previous["latitude"])) * 111_000,
                (longitude - float(previous["longitude"]))
                * 111_000 * cos(radians(latitude)),
            ) < 350
        ), None)
        if duplicate is None:
            selected.append(facility)
            continue
        previous = selected[duplicate]
        if (
            int(bool(facility.get("road_address") or facility.get("roadAddress"))),
            len(name),
        ) > (
            int(bool(previous.get("road_address") or previous.get("roadAddress"))),
            len("".join(str(previous["name"]).split())),
        ):
            selected[duplicate] = facility
    return selected
