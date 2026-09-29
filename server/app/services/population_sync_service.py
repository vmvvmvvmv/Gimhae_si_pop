"""인구 동기화 결과를 저장소에 전달하는 애플리케이션 서비스입니다."""

from typing import Any

from sqlalchemy.orm import Session

from ..models import NationalAreaAnnual, NationalPopulationMonthly
from ..repositories.population_repository import (
    save_national_admin_population,
    save_national_area,
    save_national_population,
    save_population,
)


def save_local_population_result(db: Session, result: dict[str, Any]) -> int:
    return save_population(db, result)


def save_national_population_result(
    db: Session,
    stats_ym: str,
    population: int,
) -> NationalPopulationMonthly:
    return save_national_population(db, stats_ym, population)


def save_national_area_result(
    db: Session,
    *,
    year: int,
    area_km2: float,
    source: str,
) -> NationalAreaAnnual:
    return save_national_area(db, year, area_km2, source)


def save_national_admin_population_result(
    db: Session,
    stats_ym: str,
    items: list[dict[str, Any]],
) -> int:
    return save_national_admin_population(db, stats_ym, items)
