from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import PopulationMonthly, Region


def latest_population_months(db: Session) -> dict[str, str]:
    rows = db.execute(
        select(Region.level, func.max(PopulationMonthly.stats_ym))
        .join(PopulationMonthly, PopulationMonthly.region_id == Region.id)
        .where(Region.level.in_(("admin", "legal")), Region.is_active.is_(True))
        .group_by(Region.level),
    ).all()
    return {level: month for level, month in rows if month}
