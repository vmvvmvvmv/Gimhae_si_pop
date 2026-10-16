from typing import Any

from sqlalchemy.orm import Session

from ..repositories.population_repository import (
    get_population,
    get_population_availability,
    get_population_comparison,
    get_population_trend,
    get_similar_admin_density,
)
from .population_service import PopulationLevel


class RegionNotFound(Exception):
    pass


def _valid_stats_ym(value: str) -> bool:
    return (
        len(value) == 6
        and value.isascii()
        and value.isdigit()
        and 1 <= int(value[4:]) <= 12
    )


def read_stored_population(
    db: Session, level: PopulationLevel, year: int, month: int
) -> dict[str, Any]:
    # 서비스는 DB 조회 결과를 화면에 전달할 형태로 정리하고, 없는 달도 구분합니다.
    result = get_population(db, level, year, month)
    if result is not None:
        return result
    level_name = "행정동" if level == "admin" else "법정동"
    return {
        "level": level,
        "year": year,
        "month": month,
        "count": 0,
        "items": [],
        "meta": {
            "source": "sqlite",
            "dataAvailable": False,
            "message": (
                f"해당 연월 {level_name} 데이터가 아직 저장되지 않았습니다. "
                "동기화 명령을 먼저 실행해주세요."
            ),
        },
    }


def read_availability(db: Session) -> dict[str, Any]:
    return get_population_availability(db)


def read_comparison(
    db: Session, level: PopulationLevel, region_code: str, base_ym: str, target_ym: str
) -> dict[str, Any]:
    if not _valid_stats_ym(base_ym) or not _valid_stats_ym(target_ym):
        raise ValueError("기준월과 비교월은 유효한 YYYYMM 형식이어야 합니다.")
    if base_ym == target_ym:
        raise ValueError("기준월과 비교월은 서로 달라야 합니다.")
    result = get_population_comparison(db, level, region_code, base_ym, target_ym)
    if result is None:
        raise RegionNotFound
    return result


def read_trend(
    db: Session,
    level: PopulationLevel,
    region_code: str,
    from_ym: str | None,
    to_ym: str | None,
) -> dict[str, Any]:
    if from_ym and to_ym and from_ym > to_ym:
        raise ValueError("시작년월은 종료년월보다 늦을 수 없습니다.")
    result = get_population_trend(db, level, region_code, from_ym, to_ym)
    if result is None:
        raise RegionNotFound
    return result


def read_similar_density(
    db: Session,
    region_code: str,
    year: int,
    month: int,
    limit: int,
    area_tolerance: float,
    boundary_year: int | None,
) -> dict[str, Any]:
    result = get_similar_admin_density(
        db=db,
        region_code=region_code,
        stats_ym=f"{year}{month:02d}",
        limit=limit,
        area_tolerance=area_tolerance,
        boundary_year=boundary_year,
    )
    if result is None:
        raise RegionNotFound
    return result
