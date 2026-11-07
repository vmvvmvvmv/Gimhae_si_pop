from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from ..db import get_db
from ..services.admin_auth import require_user
from ..services.population_query_service import RegionNotFound, read_similar_density


router = APIRouter(dependencies=[Depends(require_user)])


@router.get("/api/population/similar-density")
def similar_admin_density(
    region_code: str = Query(
        ...,
        min_length=8,
        max_length=10,
        pattern=r"^\d{8,10}$",
    ),
    year: int = Query(2025, ge=2000, le=2100),
    month: int = Query(12, ge=1, le=12),
    limit: int = Query(10, ge=1, le=50),
    area_tolerance: float = Query(0.1, gt=0, le=1),
    boundary_year: int | None = Query(None, ge=2000, le=2100),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """김해 행정동과 면적이 비슷한 전국 행정동을 인구밀도로 비교합니다."""

    try:
        result = read_similar_density(
            db, region_code, year, month, limit, area_tolerance, boundary_year
        )
    except RegionNotFound as error:
        raise HTTPException(
            status_code=404,
            detail="김해시 행정동 또는 해당 월의 인구 데이터를 찾을 수 없습니다.",
        ) from error

    return JSONResponse(
        content=result,
        media_type="application/json; charset=utf-8",
    )
