import logging
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .api.population import router as population_router
from .api.national_population import router as national_population_router
from .api.density import router as density_router
from .api.facilities import router as facilities_router
from .api.floating_population import router as floating_population_router
from .api.development import router as development_router
from .api.admin import router as admin_router
from .api.auth import router as auth_router
from .core.config import CORS_ORIGINS, ENABLE_API_DOCS, MOIS_SERVICE_KEY, VWORLD_API_KEY
from .db import get_db
from .services.deployment_service import read_deployment_readiness
from .services.security_headers import apply_security_headers


app = FastAPI(
    title="지역 인구 지도 API",
    version="0.1.0",
    docs_url="/docs" if ENABLE_API_DOCS else None,
    redoc_url=None,
    openapi_url="/openapi.json" if ENABLE_API_DOCS else None,
)
logger = logging.getLogger(__name__)

# 이 파일은 서버 시작점입니다. 아래 라우터들은 요청 주소를 기능별 파일로 연결합니다.


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
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Accept", "Content-Type"],
    expose_headers=["Retry-After"],
)


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    # 로그인해야 볼 수 있는 응답이 브라우저나 중간 캐시에 남지 않게 합니다.
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return apply_security_headers(response)

app.include_router(population_router)
app.include_router(national_population_router)
app.include_router(density_router)
app.include_router(facilities_router)
app.include_router(floating_population_router)
app.include_router(development_router)
app.include_router(admin_router)
app.include_router(auth_router)


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "mois_key_configured": bool(MOIS_SERVICE_KEY),
        "vworld_key_configured": bool(VWORLD_API_KEY),
    }


@app.get("/api/ready")
def ready(db: Session = Depends(get_db)) -> JSONResponse:
    try:
        result = read_deployment_readiness(db)
    except SQLAlchemyError:
        logger.exception("Deployment readiness check failed")
        return JSONResponse(status_code=503, content={"status": "not_ready"})
    return JSONResponse(
        status_code=200 if result["status"] == "ready" else 503,
        content=result,
    )


FRONTEND_DIR = Path(__file__).resolve().parents[2] / "dist"

# index.html은 배포마다 새 번들 이름을 가리키므로 매번 서버에 확인하게 합니다.
# assets/ 아래 파일은 이름에 내용 해시가 붙어 바뀌지 않으므로 오래 캐시합니다.
INDEX_CACHE_CONTROL = "no-cache"
ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable"


@app.get("/{requested_path:path}", include_in_schema=False)
def serve_frontend(requested_path: str):
    if requested_path == "api" or requested_path.startswith("api/"):
        raise HTTPException(status_code=404)
    # docs/ 는 내부 기획·배포 문서입니다. 웹으로는 어떤 경로도 열지 않습니다.
    if requested_path == "docs" or requested_path.startswith("docs/"):
        raise HTTPException(status_code=404)

    file_path = (FRONTEND_DIR / requested_path).resolve()
    try:
        file_path.relative_to(FRONTEND_DIR.resolve())
    except ValueError as error:
        raise HTTPException(status_code=404) from error

    if file_path.is_file():
        response = FileResponse(file_path)
        if file_path.name == "index.html":
            response.headers["Cache-Control"] = INDEX_CACHE_CONTROL
        elif requested_path.startswith("assets/"):
            response.headers["Cache-Control"] = ASSET_CACHE_CONTROL
        return response

    if Path(requested_path).suffix:
        raise HTTPException(status_code=404)

    index_path = FRONTEND_DIR / "index.html"
    if index_path.is_file():
        response = FileResponse(index_path)
        response.headers["Cache-Control"] = INDEX_CACHE_CONTROL
        return response

    raise HTTPException(status_code=404)
