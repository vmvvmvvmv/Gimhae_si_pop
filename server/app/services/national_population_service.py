from dataclasses import dataclass
from typing import Any

import httpx

from ..core.config import SUCCESS_CODES
from .mois_client import MoisClient, get_field

@dataclass(frozen=True)
class NationalPopulationResult:
    stats_ym: str
    population: int
    result_code: str
    result_message: Any
    source_row_count: int

def to_int(value: Any) -> int:
    try:
        return int(float(str(value or "0").replace(",", "").strip()))
    except (TypeError, ValueError):
        return 0

def row_code(row: dict[str, Any]) -> str:
    for key in ("admmCd", "admmCD", "admm_cd", "admCd"):
        value = get_field(row, key)
        if value is not None:
            return str(value).strip()
    return ""

def extract_national_population(items: list[dict[str, Any]]) -> int:
    """집계 행을 중복 계산하지 않고 전국 인구를 반환합니다."""
    if not items:
        return 0

    nationwide_rows = []
    for item in items:
        code = row_code(item)
        if code and code.lstrip("0") == "":
            nationwide_rows.append(item)
    if nationwide_rows:
        return to_int(nationwide_rows[0].get("totNmprCnt"))

    # 1단계 응답은 보통 시도별 행 목록입니다. 원천 서비스가 같은 행을
    # 반복할 수 있으므로 행정구역 코드로 중복을 제거합니다.
    unique_rows: dict[str, dict[str, Any]] = {}
    rows_without_code: list[dict[str, Any]] = []
    for item in items:
        code = row_code(item)
        if code:
            unique_rows[code] = item
        else:
            rows_without_code.append(item)

    rows = list(unique_rows.values()) if unique_rows else rows_without_code
    return sum(to_int(item.get("totNmprCnt")) for item in rows)

async def fetch_national_population(
    mois_client: MoisClient,
    statistic_month: str,
) -> NationalPopulationResult:
    async with httpx.AsyncClient(timeout=30.0) as client:
        result = await mois_client.fetch_rows(
            client,
            "admin",
            # 화면에서는 전국을 0으로 표시하지만, 원천 API의
            # 행정기관코드 파라미터는 10자리 형식을 요구합니다.
            "0000000000",
            statistic_month,
            level="admin",
            result_level="1",
        )

    return NationalPopulationResult(
        stats_ym=statistic_month,
        population=extract_national_population(result.items),
        result_code=result.result_code,
        result_message=result.result_message,
        source_row_count=len(result.items),
    )

def validate_national_result(result: NationalPopulationResult) -> None:
    if result.result_code not in SUCCESS_CODES:
        raise RuntimeError(
            "행정안전부 전국 인구 API 오류: "
            f"{result.result_code} {result.result_message or ''}".strip(),
        )
    if result.population <= 0:
        raise RuntimeError(
            "행정안전부 전국 인구 API 응답에 인구수가 없습니다.",
        )
