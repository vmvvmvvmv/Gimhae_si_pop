from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from ..db import get_db
from ..services.national_statistics_service import (
    MissingNationalData,
    get_density_summary,
    get_population_summary,
)


router = APIRouter()


@router.get("/api/national-population")
def national_population(
    year: int = Query(2025, ge=2000, le=2100),
    month: int = Query(12, ge=1, le=12),
    db: Session = Depends(get_db),
) -> JSONResponse:
    try:
        result = get_population_summary(db, year, month)
    except MissingNationalData as error:
        raise HTTPException(
            status_code=404,
            detail={
                "message": "해당 월의 전국 인구 데이터가 아직 저장되지 않았습니다.",
                "statsYm": error.period,
            },
        ) from error
    return JSONResponse(content=result, media_type="application/json; charset=utf-8")


@router.get("/api/national-density")
def national_density(
    year: int = Query(2025, ge=2000, le=2100),
    month: int = Query(12, ge=1, le=12),
    db: Session = Depends(get_db),
) -> JSONResponse:
    try:
        result = get_density_summary(db, year, month)
    except MissingNationalData as error:
        detail = (
            {"message": "해당 월의 전국 인구 데이터가 없습니다.", "statsYm": error.period}
            if error.kind == "population"
            else {"message": "해당 연도의 국토면적 데이터가 없습니다.", "year": error.period}
        )
        raise HTTPException(status_code=404, detail=detail) from error
    return JSONResponse(content=result, media_type="application/json; charset=utf-8")
