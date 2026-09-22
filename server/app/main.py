from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
