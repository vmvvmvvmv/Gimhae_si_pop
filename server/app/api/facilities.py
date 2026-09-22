from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..services.facility_service import list_facilities


router = APIRouter(tags=["facilities"])
FacilityCategory = Literal[
    "ADMIN_CENTER",
    "HOSPITAL",
    "SCHOOL",
    "UNIVERSITY",
    "TRANSIT",
    "BRIDGE",
    "PARK",
    "MARKET",
]


@router.get("/api/facilities")
def facility_list(
    category: Annotated[list[FacilityCategory], Query()] = ["ADMIN_CENTER"],
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return list_facilities(db, tuple(category))
