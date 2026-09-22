import os
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(PROJECT_ROOT / ".env")

MOIS_SERVICE_KEY = os.getenv("MOIS_SERVICE_KEY", "").strip()
SGIS_ACCESS_TOKEN = os.getenv("SGIS_ACCESS_TOKEN", "").strip()
SGIS_CONSUMER_KEY = os.getenv("SGIS_CONSUMER_KEY", "").strip()
SGIS_CONSUMER_SECRET = os.getenv("SGIS_CONSUMER_SECRET", "").strip()
VWORLD_API_KEY = os.getenv("VWORLD_API_KEY", "").strip()
VWORLD_API_DOMAIN = os.getenv(
    "VWORLD_API_DOMAIN",
    "http://localhost:5173",
).strip()


def _parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


CORS_ORIGINS = tuple(
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://localhost:5174",
    ).split(",")
    if origin.strip()
)
ENABLE_LIVE_MOIS_PROXY = _parse_bool(
    os.getenv("ENABLE_LIVE_MOIS_PROXY"),
)

try:
    NATIONAL_AREA_KM2 = float(
        os.getenv("NATIONAL_AREA_KM2", "100472.4"),
    )
except ValueError:
    NATIONAL_AREA_KM2 = 100472.4

NATIONAL_AREA_SOURCE = "국토교통부 지적통계(KOSIS)"

ENDPOINTS = {
    "admin": (
        "https://apis.data.go.kr/1741000/"
        "admmPpltnHhStus/selectAdmmPpltnHhStus"
    ),
    "legal": (
        "https://apis.data.go.kr/1741000/"
        "stdgPpltnHhStus/selectStdgPpltnHhStus"
    ),
    "admin_age": (
        "https://apis.data.go.kr/1741000/"
        "admmSexdAgePpltn/selectAdmmSexdAgePpltn"
    ),
    "legal_age": (
        "https://apis.data.go.kr/1741000/"
        "stdgSexdAgePpltn/selectStdgSexdAgePpltn"
    ),
}

ADMIN_GEOJSON_PATH = PROJECT_ROOT / "public" / "data" / "gimhae_hangjeongdong.geojson"
LEGAL_GEOJSON_PATH = PROJECT_ROOT / "public" / "data" / "Gimhae_si.geojson"

SUCCESS_CODES = {"", "0", "00", "NORMAL_SERVICE", "INFO-000"}
NO_DATA_CODES = {"3", "03", "NODATA_ERROR"}

AGE_GROUPS = (
    ("0-9세", "male0AgeNmprCnt", "feml0AgeNmprCnt"),
    ("10-19세", "male10AgeNmprCnt", "feml10AgeNmprCnt"),
    ("20-29세", "male20AgeNmprCnt", "feml20AgeNmprCnt"),
    ("30-39세", "male30AgeNmprCnt", "feml30AgeNmprCnt"),
    ("40-49세", "male40AgeNmprCnt", "feml40AgeNmprCnt"),
    ("50-59세", "male50AgeNmprCnt", "feml50AgeNmprCnt"),
    ("60-69세", "male60AgeNmprCnt", "feml60AgeNmprCnt"),
    ("70-79세", "male70AgeNmprCnt", "feml70AgeNmprCnt"),
    ("80-89세", "male80AgeNmprCnt", "feml80AgeNmprCnt"),
    ("90-99세", "male90AgeNmprCnt", "feml90AgeNmprCnt"),
    ("100세 이상", "male100AgeNmprCnt", "feml100AgeNmprCnt"),
)
