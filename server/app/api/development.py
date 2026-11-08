from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..services.admin_auth import require_user
from ..services.development_service import list_development_notices


router = APIRouter(tags=["development"], dependencies=[Depends(require_user)])


@router.get("/api/development/notices")
def development_notice_list(
    area_name: Annotated[str | None, Query(max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=2000)] = 200,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return list_development_notices(db, area_name, limit)
