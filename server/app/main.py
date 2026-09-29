import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from .api.population import router as population_router
from .api.national_population import router as national_population_router
from .api.density import router as density_router
from .api.facilities import router as facilities_router
from .api.floating_population import router as floating_population_router
from .api.development import router as development_router
from .core.config import CORS_ORIGINS, MOIS_SERVICE_KEY, VWORLD_API_KEY


app = FastAPI(
    title="지역 인구 지도 API",
    version="0.1.0",
)
logger = logging.getLogger(__name__)


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(
    request: Request,
    error: SQLAlchemyError,
) -> JSONResponse:
    """DB 내부 정보는 숨기고 서버 로그에만 원인을 남깁니다."""
    logger.exception(
        "Database operation failed: %s %s",
        request.method,
        request.url.path,
        exc_info=error,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "데이터를 처리하는 중 오류가 발생했습니다."},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(CORS_ORIGINS),
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["Accept", "Content-Type"],
)


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    return response

app.include_router(population_router)
app.include_router(national_population_router)
app.include_router(density_router)
app.include_router(facilities_router)
app.include_router(floating_population_router)
app.include_router(development_router)


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "mois_key_configured": bool(MOIS_SERVICE_KEY),
        "vworld_key_configured": bool(VWORLD_API_KEY),
    }
