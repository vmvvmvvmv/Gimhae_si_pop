from typing import Any

import httpx

from ..core.config import ENABLE_LIVE_MOIS_PROXY, MOIS_SERVICE_KEY, SUCCESS_CODES
from .mois_client import MoisClient, extract_items, get_field, get_result_info
from .population_service import PopulationLevel, get_admin_age_population


class LiveProxyError(Exception):
    def __init__(
        self, reason: str, result_code: str = "", result_message: str = ""
    ) -> None:
        self.reason = reason
        self.result_code = result_code
        self.result_message = result_message


def require_live_proxy() -> MoisClient:
    if not ENABLE_LIVE_MOIS_PROXY:
        raise LiveProxyError("disabled")
    if not MOIS_SERVICE_KEY:
        raise LiveProxyError("missing_key")
    return MoisClient(MOIS_SERVICE_KEY)


async def fetch_live_age_population(
    admm_cd: str, year: int, month: int
) -> dict[str, Any]:
    client = require_live_proxy()
    try:
        result = await get_admin_age_population(client, admm_cd, year, month)
    except httpx.HTTPError as error:
        raise LiveProxyError("connection") from error
    except ValueError as error:
        raise LiveProxyError("invalid_json") from error

    result_code = result["meta"]["result_code"]
    if result_code not in SUCCESS_CODES:
        raise LiveProxyError(
            "upstream_status", result_code, result["meta"]["result_message"]
        )
    return result


async def fetch_live_population(
    level: PopulationLevel,
    year: int,
    month: int,
    locgov_cd: str | None,
    admm_cd: str | None,
    stdg_cd: str | None,
) -> dict[str, Any]:
    client = require_live_proxy()
    region_code = (
        (admm_cd or locgov_cd) if level == "admin" else (stdg_cd or locgov_cd)
    ) or "4825000000"
    params = client.build_params(region_code, f"{year}{month:02d}", level)
    try:
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            payload = await client.fetch_payload(http_client, level, params)
    except httpx.HTTPError as error:
        raise LiveProxyError("connection") from error
    except ValueError as error:
        raise LiveProxyError("invalid_json") from error

    result_code, result_message = get_result_info(payload)
    if result_code not in SUCCESS_CODES:
        raise LiveProxyError("upstream_status", result_code, result_message)

    items = extract_items(payload)
    response_data = get_field(payload, "response", {})
    upstream_body = get_field(response_data, "body", {})
    head = get_field(response_data, "head", {})
    return {
        "level": level,
        "year": year,
        "month": month,
        "count": len(items),
        "items": items,
        "meta": {
            "result_code": result_code,
            "result_message": result_message,
            "total_count": (
                get_field(upstream_body, "totalCount")
                or get_field(head, "list_total_count")
            ),
        },
    }
