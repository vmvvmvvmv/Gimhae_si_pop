from dataclasses import dataclass
import json
from typing import Any

import httpx

from ..core.config import ENDPOINTS


@dataclass(frozen=True)
class MoisRowsResult:
    result_code: str
    result_message: Any
    items: list[dict[str, Any]]


def get_field(value: Any, name: str, default: Any = None) -> Any:
    if not isinstance(value, dict):
        return default

    for key, item in value.items():
        if str(key).lower() == name.lower():
            return item

    return default


def parse_json_response(response: httpx.Response) -> dict[str, Any]:
    for encoding in ("utf-8-sig", "utf-8", "euc-kr"):
        try:
            payload = json.loads(response.content.decode(encoding))
            if isinstance(payload, dict):
                return payload
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue

    raise ValueError("응답 본문을 JSON으로 해석할 수 없습니다.")


def extract_items(payload: dict[str, Any]) -> list[dict[str, Any]]:
    response = get_field(payload, "response", {})
    body = get_field(response, "body", {})
    items = get_field(body, "items", {})

    if not items:
        items = get_field(response, "items", {})
    if not items:
        items = get_field(response, "data", {})
    if not items:
        items = get_field(response, "item", {})
    if not items and isinstance(get_field(payload, "items"), (dict, list)):
        items = get_field(payload, "items")
    if not items and isinstance(get_field(payload, "data"), (dict, list)):
        items = get_field(payload, "data")

    if isinstance(items, dict):
        nested_items = get_field(items, "item")
        if nested_items is not None:
            items = nested_items
        else:
            values = list(items.values())
            if values and all(isinstance(value, dict) for value in values):
                items = values

    if isinstance(items, dict):
        return [items]
    if isinstance(items, list):
        return [item for item in items if isinstance(item, dict)]

    return []


def get_result_info(payload: dict[str, Any]) -> tuple[str, Any]:
    response_data = get_field(payload, "response", {})
    header = get_field(response_data, "header", {})
    head = get_field(response_data, "head", {})
    head_result = get_field(head, "RESULT", {})
    result_object = get_field(payload, "RESULT", {})

    result_code = str(
        get_field(header, "resultCode", "")
        or get_field(head, "resultCode", "")
        or get_field(head_result, "CODE", "")
        or get_field(payload, "resultCode", "")
        or get_field(payload, "result_code", "")
        or get_field(result_object, "CODE", "")
    )
    result_message = (
        get_field(header, "resultMsg")
        or get_field(payload, "resultMsg")
        or get_field(payload, "result_message")
        or get_field(result_object, "MESSAGE")
        or get_field(head_result, "MESSAGE")
    )

    return result_code, result_message


class MoisClient:
    def __init__(self, service_key: str) -> None:
        self.service_key = service_key

    def build_params(
        self,
        region_code: str,
        statistic_month: str,
        level: str = "admin",
        end_statistic_month: str | None = None,
        result_level: str = "4",
    ) -> dict[str, str]:
        code_key = "admmCd" if level == "admin" else "stdgCd"
        api_region_code = (
            f"{region_code}00"
            if level == "legal" and len(region_code) == 8
            else region_code
        )
        return {
            "serviceKey": self.service_key,
            code_key: api_region_code,
            "srchFrYm": statistic_month,
            "srchToYm": end_statistic_month or statistic_month,
            "lv": result_level,
            "pageNo": "1",
            "numOfRows": "1000",
            "type": "json",
        }

    async def fetch_payload(
        self,
        client: httpx.AsyncClient,
        endpoint_key: str,
        params: dict[str, str],
    ) -> dict[str, Any]:
        response = await client.get(ENDPOINTS[endpoint_key], params=params)
        response.raise_for_status()
        return parse_json_response(response)

    async def fetch_rows(
        self,
        client: httpx.AsyncClient,
        endpoint_key: str,
        region_code: str,
        statistic_month: str,
        level: str = "admin",
        end_statistic_month: str | None = None,
        result_level: str = "4",
    ) -> MoisRowsResult:
        payload = await self.fetch_payload(
            client,
            endpoint_key,
            self.build_params(
                region_code,
                statistic_month,
                level,
                end_statistic_month,
                result_level,
            ),
        )
        result_code, result_message = get_result_info(payload)
        return MoisRowsResult(
            result_code=result_code,
            result_message=result_message,
            items=extract_items(payload),
        )
