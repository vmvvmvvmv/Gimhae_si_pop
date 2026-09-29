from typing import Any

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from ..core.config import AGE_GROUPS
from ..core.time import utc_now
from ..models import (
    NationalAreaAnnual,
    NationalAdministrativeArea,
    NationalAdministrativePopulationMonthly,
    NationalPopulationMonthly,
    PopulationAgeMonthly,
    PopulationMonthly,
    Region,
)
from .area_repository import get_area_reference


def save_national_population(
    db: Session,
    stats_ym: str,
    population: int,
    source: str = "MOIS_API",
) -> NationalPopulationMonthly:
    row = db.scalar(
        select(NationalPopulationMonthly).where(
            NationalPopulationMonthly.stats_ym == stats_ym,
        ),
    )
    if row is None:
        row = NationalPopulationMonthly(stats_ym=stats_ym)
        db.add(row)

    row.population = population
    row.source = source
    row.fetched_at = utc_now()
    db.flush()
    db.refresh(row)
    return row


def get_national_population(
    db: Session,
    stats_ym: str,
) -> NationalPopulationMonthly | None:
    return db.scalar(
        select(NationalPopulationMonthly).where(
            NationalPopulationMonthly.stats_ym == stats_ym,
        ),
    )

def save_national_area(
    db: Session,
    year: int,
    area_km2: float,
    source: str = "KOSIS",
) -> NationalAreaAnnual:
    row = db.scalar(
        select(NationalAreaAnnual).where(
            NationalAreaAnnual.year == year,
        ),
    )

    if row is None:
        row = NationalAreaAnnual(year=year)
        db.add(row)

    row.area_km2 = area_km2
    row.source = source
    row.fetched_at = utc_now()

    db.flush()
    db.refresh(row)
    return row


def get_national_area(
    db: Session,
    year: int,
) -> NationalAreaAnnual | None:
    return db.scalar(
        select(NationalAreaAnnual).where(
            NationalAreaAnnual.year == year,
        ),
    )


def save_national_admin_population(
    db: Session,
    stats_ym: str,
    items: list[dict[str, Any]],
    source: str = "KOSIS_DT_1B04005N",
) -> int:
    existing_rows = db.scalars(
        select(NationalAdministrativePopulationMonthly).where(
            NationalAdministrativePopulationMonthly.stats_ym == stats_ym,
        ),
    ).all()
    existing_by_code = {row.region_code: row for row in existing_rows}

    saved_count = 0
    for item in items:
        region_code = str(item["regionCode"])
        row = existing_by_code.get(region_code)
        if row is None:
            row = NationalAdministrativePopulationMonthly(
                region_code=region_code,
                stats_ym=stats_ym,
            )
            db.add(row)

        row.region_name = str(item["regionName"])
        row.population = int(item["population"])
        row.source = source
        row.fetched_at = utc_now()
        saved_count += 1

    db.flush()
    return saved_count


def _normalize_region_name(value: str) -> str:
    return "".join(value.split()).replace("·", "")


def get_similar_admin_density(
    db: Session,
    region_code: str,
    stats_ym: str,
    limit: int,
    area_tolerance: float,
    boundary_year: int | None = None,
) -> dict[str, Any] | None:
    """선택 지역과 면적이 비슷한 전국 행정동의 인구밀도를 만듭니다."""
    target = db.scalar(
        select(Region).where(
            Region.level == "admin",
            Region.region_code == region_code,
            Region.is_active.is_(True),
        ),
    )
    if target is None or not target.area_m2:
        return None

    target_population = db.scalar(
        select(PopulationMonthly).where(
            PopulationMonthly.region_id == target.id,
            PopulationMonthly.stats_ym == stats_ym,
        ),
    )
    if target_population is None:
        return None

    selected_boundary_year = boundary_year
    if selected_boundary_year is None:
        selected_boundary_year = db.scalar(
            select(func.max(NationalAdministrativeArea.boundary_year)).where(
                NationalAdministrativeArea.boundary_year <= int(stats_ym[:4]),
            ),
        )
        if selected_boundary_year is None:
            selected_boundary_year = db.scalar(
                select(func.max(NationalAdministrativeArea.boundary_year)),
            )

    if selected_boundary_year is None:
        return {
            "target": _density_snapshot(
                target.region_code,
                target.region_name,
                target.area_m2 / 1_000_000,
                target_population.population,
            ),
            "matches": [],
            "comparison": {
                "sampleCount": 0,
                "averageDensityPerKm2": None,
                "targetToAverageRatio": None,
            },
            "meta": {
                "source": "sqlite",
                "boundaryYear": None,
                "areaCandidateCount": 0,
                "populationDataIncluded": False,
                "message": "전국 행정동 면적 데이터를 먼저 등록해주세요.",
            },
        }

    target_short_name = target.region_name.split()[-1]
    national_target_area = db.scalar(
        select(NationalAdministrativeArea).where(
            NationalAdministrativeArea.boundary_year == selected_boundary_year,
            or_(
                NationalAdministrativeArea.region_name == target.region_name,
                NationalAdministrativeArea.region_name.like(
                    f"%김해시 {target_short_name}",
                ),
            ),
        ),
    )
    target_area_km2 = (
        national_target_area.area_km2
        if national_target_area is not None
        else target.area_m2 / 1_000_000
    )
    min_area = target_area_km2 * (1 - area_tolerance)
    max_area = target_area_km2 * (1 + area_tolerance)
    candidate_conditions = [
        NationalAdministrativeArea.boundary_year == selected_boundary_year,
        NationalAdministrativeArea.area_km2 >= min_area,
        NationalAdministrativeArea.area_km2 <= max_area,
    ]
    if national_target_area is not None:
        candidate_conditions.append(
            NationalAdministrativeArea.region_code
            != national_target_area.region_code,
        )

    candidates = db.scalars(
        select(NationalAdministrativeArea).where(*candidate_conditions),
    ).all()

    candidate_codes = [candidate.region_code for candidate in candidates]
    candidate_names = [candidate.region_name for candidate in candidates]
    population_rows = db.scalars(
        select(NationalAdministrativePopulationMonthly).where(
            or_(
                NationalAdministrativePopulationMonthly.region_code.in_(
                    candidate_codes,
                ),
                NationalAdministrativePopulationMonthly.region_name.in_(
                    candidate_names,
                ),
            ),
            NationalAdministrativePopulationMonthly.stats_ym == stats_ym,
        ),
    ).all() if candidate_codes else []
    population_by_code = {
        row.region_code: row for row in population_rows
    }
    population_by_name = {
        _normalize_region_name(row.region_name): row
        for row in population_rows
    }

    matches: list[dict[str, Any]] = []
    for candidate in candidates:
        population_row = (
            population_by_code.get(candidate.region_code)
            or population_by_name.get(
                _normalize_region_name(candidate.region_name),
            )
        )
        area_difference_km2 = candidate.area_km2 - target_area_km2
        area_difference_rate = (
            round(area_difference_km2 / target_area_km2 * 100, 2)
            if target_area_km2
            else 0
        )
        population = population_row.population if population_row else None
        matches.append({
            "regionCode": candidate.region_code,
            "regionName": candidate.region_name,
            "areaKm2": round(candidate.area_km2, 2),
            "areaDifferenceKm2": round(area_difference_km2, 2),
            "areaDifferenceRate": area_difference_rate,
            "population": population,
            "densityPerKm2": (
                round(population / candidate.area_km2, 2)
                if population is not None and candidate.area_km2
                else None
            ),
            "populationDataAvailable": population_row is not None,
        })

    matches.sort(key=lambda item: abs(item["areaDifferenceKm2"]))
    comparable_matches = [
        item
        for item in matches
        if item["population"] is not None
        and item["densityPerKm2"] is not None
        and item["areaKm2"]
    ]
    comparable_population = sum(
        item["population"] for item in comparable_matches
    )
    comparable_area = sum(item["areaKm2"] for item in comparable_matches)
    average_density = (
        round(comparable_population / comparable_area, 2)
        if comparable_area
        else None
    )
    target_density = (
        target_population.population / target_area_km2
        if target_area_km2
        else None
    )
    target_to_average_ratio = (
        round(target_density / average_density, 2)
        if target_density is not None and average_density
        else None
    )
    return {
        "target": _density_snapshot(
            target.region_code,
            target.region_name,
            target_area_km2,
            target_population.population,
        ),
        "matches": matches[:limit],
        "comparison": {
            "sampleCount": len(comparable_matches),
            "averageDensityPerKm2": average_density,
            "targetToAverageRatio": target_to_average_ratio,
        },
        "meta": {
            "source": "sqlite",
            "statsYm": stats_ym,
            "boundaryYear": selected_boundary_year,
            "areaCandidateCount": len(matches),
            "populationDataIncluded": bool(population_rows),
            "areaToleranceRate": round(area_tolerance * 100, 2),
            "targetAreaSource": (
                national_target_area.source
                if national_target_area is not None
                else "GIMHAE_GEOJSON"
            ),
        },
    }


def _density_snapshot(
    region_code: str,
    region_name: str,
    area_km2: float,
    population: int,
) -> dict[str, Any]:
    return {
        "regionCode": region_code,
        "regionName": region_name,
        "areaKm2": round(area_km2, 2),
        "population": population,
        "densityPerKm2": (
            round(population / area_km2, 2) if area_km2 else None
        ),
    }


def get_population_availability(db: Session) -> dict[str, Any]:
    active_region_counts = dict(
        db.execute(
            select(Region.level, func.count(Region.id))
            .where(Region.is_active.is_(True))
            .group_by(Region.level),
        ).all(),
    )
    monthly_counts = db.execute(
        select(
            Region.level,
            PopulationMonthly.stats_ym,
            func.count(PopulationMonthly.id),
        )
        .join(Region, Region.id == PopulationMonthly.region_id)
        .where(Region.is_active.is_(True))
        .group_by(Region.level, PopulationMonthly.stats_ym)
        .order_by(Region.level, PopulationMonthly.stats_ym),
    ).all()

    items: list[dict[str, Any]] = []
    for level, stats_ym, stored_count in monthly_counts:
        expected_count = active_region_counts.get(level, 0)
        items.append({
            "level": level,
            "statsYm": stats_ym,
            "storedRegionCount": stored_count,
            "expectedRegionCount": expected_count,
            "complete": stored_count == expected_count,
        })

    by_level: dict[str, list[dict[str, Any]]] = {
        "admin": [],
        "legal": [],
    }
    for item in items:
        by_level.setdefault(item["level"], []).append(item)

    levels: dict[str, dict[str, Any]] = {}
    for level, level_items in by_level.items():
        months = [item["statsYm"] for item in level_items]
        levels[level] = {
            "months": months,
            "minStatsYm": months[0] if months else None,
            "maxStatsYm": months[-1] if months else None,
            "expectedRegionCount": active_region_counts.get(level, 0),
            "completeMonthCount": sum(
                1 for item in level_items if item["complete"]
            ),
        }

    return {
        "items": items,
        "levels": levels,
        "meta": {
            "source": "sqlite",
            "description": "저장된 월별 지역 수와 기준 지역 수를 비교한 결과입니다.",
        },
    }


def get_population_trend(
    db: Session,
    level: str,
    region_code: str,
    from_ym: str | None = None,
    to_ym: str | None = None,
) -> dict[str, Any] | None:
    """선택 지역의 저장된 월별 인구 추이를 오래된 월부터 반환합니다."""
    region = db.scalar(
        select(Region).where(
            Region.level == level,
            Region.region_code == region_code,
        ),
    )
    if region is None:
        return None

    conditions = [PopulationMonthly.region_id == region.id]
    if from_ym:
        conditions.append(PopulationMonthly.stats_ym >= from_ym)
    if to_ym:
        conditions.append(PopulationMonthly.stats_ym <= to_ym)

    rows = db.scalars(
        select(PopulationMonthly)
        .where(*conditions)
        .order_by(PopulationMonthly.stats_ym),
    ).all()
    points = [
        {
            "statsYm": row.stats_ym,
            "population": row.population,
            "households": row.households,
            "populationPerHousehold": row.population_per_household,
        }
        for row in rows
    ]

    if not points:
        summary = {
            "first": None,
            "latest": None,
            "minimum": None,
            "maximum": None,
            "change": None,
            "changeRate": None,
        }
    else:
        first = points[0]
        latest = points[-1]
        minimum = min(points, key=lambda point: point["population"])
        maximum = max(points, key=lambda point: point["population"])
        change = latest["population"] - first["population"]
        change_rate = (
            round(change / first["population"] * 100, 2)
            if first["population"]
            else None
        )
        summary = {
            "first": first,
            "latest": latest,
            "minimum": minimum,
            "maximum": maximum,
            "change": change,
            "changeRate": change_rate,
        }

    return {
        "level": level,
        "regionCode": region.region_code,
        "regionName": region.region_name,
        "count": len(points),
        "items": points,
        "summary": summary,
        "meta": {
            "source": "sqlite",
            "minStatsYm": points[0]["statsYm"] if points else None,
            "maxStatsYm": points[-1]["statsYm"] if points else None,
        },
    }


def get_population_comparison(
    db: Session,
    level: str,
    region_code: str,
    base_ym: str,
    target_ym: str,
) -> dict[str, Any] | None:
    region = db.scalar(
        select(Region).where(
            Region.level == level,
            Region.region_code == region_code,
            Region.is_active.is_(True),
        ),
    )
    if not region:
        return None

    rows = db.scalars(
        select(PopulationMonthly).where(
            PopulationMonthly.region_id == region.id,
            PopulationMonthly.stats_ym.in_([base_ym, target_ym]),
        ),
    ).all()
    row_by_month = {row.stats_ym: row for row in rows}
    base = row_by_month.get(base_ym)
    target = row_by_month.get(target_ym)

    def snapshot(row: PopulationMonthly | None) -> dict[str, Any] | None:
        if not row:
            return None
        return {
            "statsYm": row.stats_ym,
            "population": row.population,
            "households": row.households,
            "populationPerHousehold": row.population_per_household,
        }

    change = target.population - base.population if base and target else None
    change_rate = (
        round((change / base.population) * 100, 2)
        if change is not None and base and base.population
        else None
    )

    return {
        "level": level,
        "regionCode": region.region_code,
        "regionName": region.region_name,
        "base": snapshot(base),
        "target": snapshot(target),
        "change": change,
        "changeRate": change_rate,
        "meta": {
            "source": "sqlite",
            "dataAvailable": bool(base and target),
        },
    }


def shift_month(stats_ym: str, offset: int) -> str:
    year = int(stats_ym[:4])
    month = int(stats_ym[4:])
    absolute_month = year * 12 + month - 1 + offset
    return f"{absolute_month // 12}{absolute_month % 12 + 1:02d}"


def build_comparison(
    current: PopulationMonthly,
    previous: PopulationMonthly | None,
    stats_ym: str,
) -> dict[str, Any]:
    if not previous:
        return {
            "statsYm": stats_ym,
            "population": None,
            "change": None,
            "changeRate": None,
        }

    change = current.population - previous.population
    change_rate = (
        round((change / previous.population) * 100, 2)
        if previous.population
        else None
    )
    return {
        "statsYm": stats_ym,
        "population": previous.population,
        "change": change,
        "changeRate": change_rate,
    }


def save_population(
    db: Session,
    result: dict[str, Any],
) -> int:
    level = result["level"]
    stats_ym = f"{result['year']}{result['month']:02d}"
    saved_count = 0

    for item in result["items"]:
        region = db.scalar(
            select(Region).where(
                Region.level == level,
                Region.region_code == item["regionCode"],
            ),
        )
        if not region:
            continue

        population = db.scalar(
            select(PopulationMonthly).where(
                PopulationMonthly.region_id == region.id,
                PopulationMonthly.stats_ym == stats_ym,
            ),
        )
        if not population:
            population = PopulationMonthly(
                region_id=region.id,
                stats_ym=stats_ym,
            )
            db.add(population)

        population.population = item["population"]
        population.male_population = item["malePopulation"]
        population.female_population = item["femalePopulation"]
        population.households = item["households"]
        population.population_per_household = item["populationPerHousehold"]
        population.source = result.get("source", "MOIS")
        population.fetched_at = utc_now()

        db.execute(
            delete(PopulationAgeMonthly).where(
                PopulationAgeMonthly.region_id == region.id,
                PopulationAgeMonthly.stats_ym == stats_ym,
            ),
        )

        for age_item in item.get("ageDistribution", []):
            db.add(
                PopulationAgeMonthly(
                    region_id=region.id,
                    stats_ym=stats_ym,
                    age_group=age_item["ageGroup"],
                    population=age_item["population"],
                    male_population=age_item["malePopulation"],
                    female_population=age_item["femalePopulation"],
                    source=result.get("source", "MOIS"),
                    fetched_at=utc_now(),
                ),
            )

        saved_count += 1

    # 월별 인구와 연령 분포는 반드시 함께 성공하거나 함께 취소되어야 합니다.
    db.flush()
    return saved_count


def get_population(
    db: Session,
    level: str,
    year: int,
    month: int,
) -> dict[str, Any] | None:
    stats_ym = f"{year}{month:02d}"
    area_reference = get_area_reference(db, level, year)

    regions = db.scalars(
        select(Region)
        .where(
            Region.level == level,
            Region.is_active.is_(True),
        )
        .order_by(Region.region_name),
    ).all()
    comparison_month = shift_month(stats_ym, -1)
    comparison_year = shift_month(stats_ym, -12)
    region_ids = [region.id for region in regions]
    if not region_ids:
        return None
    population_rows = db.scalars(
        select(PopulationMonthly).where(
            PopulationMonthly.region_id.in_(region_ids),
            PopulationMonthly.stats_ym.in_(
                [stats_ym, comparison_month, comparison_year],
            ),
        ),
    ).all()

    current_rows = [
        row for row in population_rows if row.stats_ym == stats_ym
    ]
    if not current_rows:
        return None

    population_by_key = {
        (row.region_id, row.stats_ym): row for row in population_rows
    }
    age_rows = db.scalars(
        select(PopulationAgeMonthly).where(
            PopulationAgeMonthly.region_id.in_(region_ids),
            PopulationAgeMonthly.stats_ym == stats_ym,
        ),
    ).all()
    age_by_region: dict[int, list[PopulationAgeMonthly]] = {}
    for row in age_rows:
        age_by_region.setdefault(row.region_id, []).append(row)
    age_order = {
        label: index for index, (label, _, _) in enumerate(AGE_GROUPS)
    }

    items: list[dict[str, Any]] = []
    for region in regions:
        population = population_by_key.get((region.id, stats_ym))
        if not population:
            continue

        area_km2, area_source, area_reference_year = (
            area_reference.resolve(region)
        )

        items.append({
            "regionCode": region.region_code,
            "regionName": region.region_name,
            "population": population.population,
            "households": population.households,
            "populationPerHousehold": population.population_per_household,
            "malePopulation": population.male_population,
            "femalePopulation": population.female_population,
            "areaKm2": round(area_km2, 2),
            "populationDensity": (
                round(population.population / area_km2, 2)
                if area_km2
                else 0
            ),
            "areaSource": area_source,
            "areaReferenceYear": area_reference_year,
            "comparisons": {
                "previousMonth": build_comparison(
                    population,
                    population_by_key.get(
                        (region.id, comparison_month),
                    ),
                    comparison_month,
                ),
                "previousYear": build_comparison(
                    population,
                    population_by_key.get(
                        (region.id, comparison_year),
                    ),
                    comparison_year,
                ),
            },
            "sourceRowCount": 0,
            "ageDistribution": [
                {
                    "ageGroup": age.age_group,
                    "population": age.population,
                    "malePopulation": age.male_population,
                    "femalePopulation": age.female_population,
                }
                for age in sorted(
                    age_by_region.get(region.id, []),
                    key=lambda item: age_order.get(item.age_group, 999),
                )
            ],
            "ageSourceRowCount": len(age_by_region.get(region.id, [])),
        })

    return {
        "level": level,
        "year": year,
        "month": month,
        "count": len(items),
        "items": items,
        "meta": {
            "source": "sqlite",
            "dataAvailable": True,
            "requestedRegionCount": len(regions),
            "storedRegionCount": len(items),
            "missingRegionCount": len(regions) - len(items),
            "ageDataIncluded": bool(age_rows),
            "areaSource": area_reference.source,
            "areaReferenceYear": area_reference.reference_year,
        },
    }


def save_admin_population(
    db: Session,
    result: dict[str, Any],
) -> int:
    return save_population(db, result)


def get_admin_population(
    db: Session,
    year: int,
    month: int,
) -> dict[str, Any] | None:
    return get_population(db, "admin", year, month)
