from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import PopulationMonthly, Region


def list_export_population(
    db: Session,
    level: str,
    region_codes: list[str] | None,
    from_ym: str,
    to_ym: str,
    limit: int,
) -> list[tuple[Region, PopulationMonthly]]:
    conditions = [
        Region.level == level,
        Region.is_active.is_(True),
        PopulationMonthly.stats_ym >= from_ym,
        PopulationMonthly.stats_ym <= to_ym,
    ]
    if region_codes is not None:
        conditions.append(Region.region_code.in_(region_codes))

    return [
        (region, population)
        for region, population in db.execute(
            select(Region, PopulationMonthly)
            .join(PopulationMonthly, PopulationMonthly.region_id == Region.id)
            .where(*conditions)
            .order_by(PopulationMonthly.stats_ym, Region.region_name)
            .limit(limit),
        ).all()
    ]


def get_previous_population(
    db: Session,
    region_ids: set[int],
    stats_months: set[str],
) -> dict[tuple[int, str], PopulationMonthly]:
    if not region_ids or not stats_months:
        return {}
    rows = db.scalars(
        select(PopulationMonthly).where(
            PopulationMonthly.region_id.in_(region_ids),
            PopulationMonthly.stats_ym.in_(stats_months),
        ),
    ).all()
    return {(row.region_id, row.stats_ym): row for row in rows}
