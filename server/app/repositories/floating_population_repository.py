from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import FloatingPopulationMonthly, Region


def get_floating_population(
    db: Session,
    stats_ym: str,
) -> list[dict[str, object]]:
    rows = db.execute(
        select(FloatingPopulationMonthly, Region)
        .join(Region, Region.id == FloatingPopulationMonthly.region_id)
        .where(
            FloatingPopulationMonthly.stats_ym == stats_ym,
            Region.level == "admin",
            Region.is_active.is_(True),
        )
        .order_by(Region.region_code),
    ).all()

    return [
        {
            "regionCode": region.region_code,
            "regionName": region.region_name,
            "servicePopulation": population.service_population,
            "residentialPopulation": population.residential_population,
            "workplacePopulation": population.workplace_population,
            "visitorPopulation": population.visitor_population,
            "source": population.source,
        }
        for population, region in rows
    ]


def get_floating_population_months(db: Session) -> list[str]:
    """저장된 유동인구 기준월을 오래된 순서로 반환합니다."""
    return list(
        db.scalars(
            select(FloatingPopulationMonthly.stats_ym)
            .distinct()
            .order_by(FloatingPopulationMonthly.stats_ym),
        ),
    )
