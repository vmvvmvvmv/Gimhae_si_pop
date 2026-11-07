from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session

from ..db import get_db
from ..services.admin_auth import require_user
from ..services.mois_proxy_service import (
    LiveProxyError,
    fetch_live_age_population,
    fetch_live_population,
)
from ..services.population_service import PopulationLevel
from ..services.export_limits import ExportLimitError, ExportRateLimiter
from ..services.population_export_service import (
    NoExportData,
    population_export_csv,
    prepare_population_export,
)
from ..services.population_query_service import (
    RegionNotFound,
    read_availability,
    read_comparison,
    read_stored_population,
    read_trend,
)


router = APIRouter()
export_rate_limiter = ExportRateLimiter()


def _enforce_export_rate_limit(request: Request) -> None:
    client_key = request.client.host if request.client else "unknown"
    if not export_rate_limiter.allow(client_key):
        raise HTTPException(
            status_code=429,
            detail="CSV export 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
            headers={"Retry-After": "60"},
        )


def _read_export(
    db: Session,
    level: PopulationLevel,
    scope: Literal["region", "month"],
    fields: list[str],
    region_code: str | None,
    from_ym: str | None,
    to_ym: str | None,
    stats_ym: str | None,
    region_codes: list[str] | None = None,
) -> dict:
    try:
        return prepare_population_export(
            db, level, scope, fields, region_code, from_ym, to_ym, stats_ym,
            region_codes,
        )
    except ExportLimitError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except NoExportData as error:
        raise HTTPException(
            status_code=404,
            detail="선택한 범위에 저장된 인구 자료가 없습니다.",
        ) from error


@router.get("/api/population/export/preview", dependencies=[Depends(require_user)])
def population_export_preview(
    request: Request,
    level: PopulationLevel = Query("admin"),
    scope: Literal["region", "month"] = Query(...),
    fields: list[str] = Query(...),
    region_code: str | None = Query(None, min_length=8, max_length=10, pattern=r"^\d{8,10}$"),
    from_ym: str | None = Query(None),
    to_ym: str | None = Query(None),
    stats_ym: str | None = Query(None),
    region_codes: list[str] | None = Query(None),
    db: Session = Depends(get_db),
) -> dict:
    _enforce_export_rate_limit(request)
    export = _read_export(db, level, scope, fields, region_code, from_ym, to_ym, stats_ym, region_codes)
    return {"columns": export["columns"], "rows": export["rows"][:5], "count": export["count"]}


@router.get("/api/population/export.csv", dependencies=[Depends(require_user)])
def download_population_export(
    request: Request,
    level: PopulationLevel = Query("admin"),
    scope: Literal["region", "month"] = Query(...),
    fields: list[str] = Query(...),
    region_code: str | None = Query(None, min_length=8, max_length=10, pattern=r"^\d{8,10}$"),
    from_ym: str | None = Query(None),
    to_ym: str | None = Query(None),
    stats_ym: str | None = Query(None),
    region_codes: list[str] | None = Query(None),
    db: Session = Depends(get_db),
) -> Response:
    _enforce_export_rate_limit(request)
    export = _read_export(db, level, scope, fields, region_code, from_ym, to_ym, stats_ym, region_codes)
    period = stats_ym if scope == "month" else f"{from_ym}-{to_ym}"
    filename = f"gimhae_population_{level}_{scope}_{period}.csv"
    return Response(
        content=population_export_csv(export),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def live_proxy_http_error(error: LiveProxyError, *, age: bool) -> HTTPException:
    if error.reason == "disabled":
        return HTTPException(404, "실시간 원천 API 프록시는 비활성화되어 있습니다.")
    if error.reason == "missing_key":
        return HTTPException(500, "MOIS_SERVICE_KEY가 설정되지 않았습니다.")
    if error.reason == "connection":
        message = (
            "행정안전부 연령 API 연결에 실패했습니다."
            if age else "행정안전부 API 연결에 실패했습니다."
        )
        return HTTPException(502, message)
    if error.reason == "invalid_json":
        message = (
            "행정안전부 연령 API 응답을 JSON으로 해석할 수 없습니다."
            if age else "행정안전부 API가 JSON 형식으로 응답하지 않았습니다."
        )
        return HTTPException(502, message)
    return HTTPException(
        502,
        {
            "message": (
                "행정안전부 연령 API가 오류를 반환했습니다."
                if age else "행정안전부 API가 오류를 반환했습니다."
            ),
            "result_code": error.result_code,
            "result_message": error.result_message,
        },
    )


@router.get("/api/population/admin-ages", dependencies=[Depends(require_user)])
async def admin_age_population(
    admm_cd: str = Query(
        "4825025000",
        min_length=10,
        max_length=10,
        pattern=r"^\d{10}$",
    ),
    year: int = Query(2025, ge=2000, le=2100),
    month: int = Query(12, ge=1, le=12),
) -> JSONResponse:
    try:
        result = await fetch_live_age_population(admm_cd, year, month)
    except LiveProxyError as error:
        raise live_proxy_http_error(error, age=True) from error

    return JSONResponse(
        content=result,
        media_type="application/json; charset=utf-8",
    )


@router.get("/api/population/regions")
async def region_population(
    level: PopulationLevel = Query("admin"),
    year: int = Query(2025, ge=2000, le=2100),
    month: int = Query(12, ge=1, le=12),
    db: Session = Depends(get_db),
) -> JSONResponse:
    # Query가 형식·범위(예: month 1~12)를 검사합니다. 실제 DB 조회와
    # '저장되지 않은 월' 응답은 population_query_service가 결정합니다.
    return JSONResponse(
        content=read_stored_population(db, level, year, month),
        media_type="application/json; charset=utf-8",
    )


@router.get("/api/population/availability")
async def population_availability(db: Session = Depends(get_db)) -> JSONResponse:
    result = read_availability(db)
    return JSONResponse(
        content=result,
        media_type="application/json; charset=utf-8",
    )


@router.get("/api/population/comparison", dependencies=[Depends(require_user)])
async def population_comparison(
    level: PopulationLevel = Query("admin"),
    region_code: str = Query(
        ...,
        min_length=8,
        max_length=10,
        pattern=r"^\d{8,10}$",
    ),
    base_ym: str = Query(..., min_length=6, max_length=6, pattern=r"^\d{6}$"),
    target_ym: str = Query(..., min_length=6, max_length=6, pattern=r"^\d{6}$"),
    db: Session = Depends(get_db),
) -> JSONResponse:
    # Query는 YYYYMM의 모양만 검사합니다. 202613처럼 실제로 없는 월과
    # 같은 달끼리의 비교는 서비스가 검사하고 여기서 400으로 바꿉니다.
    try:
        result = read_comparison(db, level, region_code, base_ym, target_ym)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RegionNotFound as error:
        # 서비스의 지역 없음 예외를 브라우저가 이해할 HTTP 404로 변환합니다.
        raise HTTPException(status_code=404, detail="지역을 찾을 수 없습니다.") from error

    return JSONResponse(
        content=result,
        media_type="application/json; charset=utf-8",
    )


@router.get("/api/population/trend", dependencies=[Depends(require_user)])
async def population_trend(
    level: PopulationLevel = Query("admin"),
    region_code: str = Query(
        ...,
        min_length=8,
        max_length=10,
        pattern=r"^\d{8,10}$",
    ),
    from_ym: str | None = Query(
        None,
        min_length=6,
        max_length=6,
        pattern=r"^\d{6}$",
    ),
    to_ym: str | None = Query(
        None,
        min_length=6,
        max_length=6,
        pattern=r"^\d{6}$",
    ),
    db: Session = Depends(get_db),
) -> JSONResponse:
    try:
        result = read_trend(db, level, region_code, from_ym, to_ym)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RegionNotFound as error:
        raise HTTPException(status_code=404, detail="지역을 찾을 수 없습니다.") from error

    return JSONResponse(
        content=result,
        media_type="application/json; charset=utf-8",
    )


@router.get("/api/population/admin-regions")
async def admin_region_population(
    year: int = Query(2025, ge=2000, le=2100),
    month: int = Query(12, ge=1, le=12),
    db: Session = Depends(get_db),
) -> JSONResponse:
    return JSONResponse(
        content=read_stored_population(db, "admin", year, month),
        media_type="application/json; charset=utf-8",
    )


@router.get("/api/population/legal-regions")
async def legal_region_population(
    year: int = Query(2025, ge=2000, le=2100),
    month: int = Query(12, ge=1, le=12),
    db: Session = Depends(get_db),
) -> JSONResponse:
    return JSONResponse(
        content=read_stored_population(db, "legal", year, month),
        media_type="application/json; charset=utf-8",
    )


@router.get("/api/population", dependencies=[Depends(require_user)])
async def population(
    level: Literal["admin", "legal"] = Query("admin"),
    year: int = Query(2025, ge=2000, le=2100),
    month: int = Query(12, ge=1, le=12),
    locgov_cd: str | None = Query(
        None,
        min_length=10,
        max_length=10,
        pattern=r"^\d{10}$",
    ),
    admm_cd: str | None = Query(
        None,
        min_length=10,
        max_length=10,
        pattern=r"^\d{10}$",
    ),
    stdg_cd: str | None = Query(
        None,
        min_length=10,
        max_length=10,
        pattern=r"^\d{10}$",
    ),
) -> JSONResponse:
    try:
        result = await fetch_live_population(
            level, year, month, locgov_cd, admm_cd, stdg_cd
        )
    except LiveProxyError as error:
        raise live_proxy_http_error(error, age=False) from error

    return JSONResponse(
        content=result,
        media_type="application/json; charset=utf-8",
    )
