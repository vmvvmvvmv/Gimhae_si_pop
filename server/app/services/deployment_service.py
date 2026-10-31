from sqlalchemy.orm import Session

from ..repositories.deployment_repository import latest_population_months


def read_deployment_readiness(db: Session) -> dict[str, object]:
    latest_months = latest_population_months(db)
    missing_levels = [
        level for level in ("admin", "legal") if level not in latest_months
    ]
    return {
        "status": "not_ready" if missing_levels else "ready",
        "latest_months": latest_months,
        "missing_levels": missing_levels,
    }
