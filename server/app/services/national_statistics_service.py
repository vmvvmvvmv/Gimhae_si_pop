from typing import Any

from sqlalchemy.orm import Session

from ..repositories.population_repository import get_national_area, get_national_population


class MissingNationalData(Exception):
    def __init__(self, kind: str, period: str | int) -> None:
        self.kind = kind
        self.period = period


def get_population_summary(db: Session, year: int, month: int) -> dict[str, Any]:
    stats_ym = f"{year}{month:02d}"
    row = get_national_population(db, stats_ym)
    if row is None:
        raise MissingNationalData("population", stats_ym)
    return {
        "year": year,
        "month": month,
        "statsYm": stats_ym,
        "population": row.population,
        "meta": {
            "source": row.source,
            "fetchedAt": row.fetched_at.isoformat(),
            "definition": "행정안전부 주민등록 인구통계 전국 합계",
        },
    }


def get_density_summary(db: Session, year: int, month: int) -> dict[str, Any]:
    stats_ym = f"{year}{month:02d}"
    population_row = get_national_population(db, stats_ym)
    area_row = get_national_area(db, year)
    if population_row is None:
        raise MissingNationalData("population", stats_ym)
    if area_row is None:
        raise MissingNationalData("area", year)
    return {
        "year": year,
        "month": month,
        "statsYm": stats_ym,
        "population": population_row.population,
        "areaKm2": area_row.area_km2,
        "densityPerKm2": round(population_row.population / area_row.area_km2, 2),
        "meta": {
            "populationSource": population_row.source,
            "areaSource": area_row.source,
            "areaNote": "연도별 국토면적 DB 기준",
        },
    }
