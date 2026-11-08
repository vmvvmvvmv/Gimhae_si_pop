from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..services.admin_auth import require_user
from ..services.floating_population_service import (
    get_availability,
    get_monthly_population,
)


router = APIRouter(tags=["floating-population"], dependencies=[Depends(require_user)])


@router.get("/api/floating-population/availability")
def floating_population_availability(db: Session = Depends(get_db)) -> dict[str, object]:
    return get_availability(db)


@router.get("/api/floating-population")
def floating_population_list(
    year: Annotated[int, Query(ge=2000, le=2100)],
    month: Annotated[int, Query(ge=1, le=12)],
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return get_monthly_population(db, year, month)
