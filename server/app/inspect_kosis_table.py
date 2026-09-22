import argparse
from collections import Counter
import json
import os
import re
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")

KOSIS_API_KEY = os.getenv("KOSIS_API_KEY", "").strip()
META_URL = "https://kosis.kr/openapi/statisticsData.do"


def parse_kosis_response(text: str) -> Any:
    text = text.lstrip("\ufeff").strip()

    if text.startswith("<"):
        raise RuntimeError("KOSIS가 HTML 오류 페이지를 반환했습니다.")

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # KOSIS가 가끔 JSON처럼 보이지만 key에 따옴표가 없는
        # 응답을 반환하므로 key 부분을 JSON 형식으로 보정합니다.
        normalized_text = re.sub(
            r"([,{])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:",
            r'\1"\2":',
            text,
        )
        return json.loads(normalized_text)


def get_value(
    row: dict[str, Any],
    *keys: str,
) -> Any:
    for key in keys:
        if row.get(key) is not None:
            return row.get(key)

    return ""


def print_row(row: dict[str, Any]) -> None:
    object_id = get_value(row, "OBJ_ID", "objId")
    object_name = get_value(row, "OBJ_NM", "objNm")
    item_id = get_value(row, "ITM_ID", "itmId")
    item_name = get_value(row, "ITM_NM", "itmNm")
    unit_name = get_value(row, "UNIT_NM", "unitNm")

    print(f"분류ID: {object_id}")
    print(f"분류명: {object_name}")
    print(f"항목ID: {item_id}")
    print(f"항목명: {item_name}")
    print(f"단위: {unit_name}")
    print("-" * 60)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--org-id", default="116")
    parser.add_argument("--table-id", default="DT_MLTM_2300")
    parser.add_argument("--meta-type", default="ITM")
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--show-keys", action="store_true")
    parser.add_argument("--object-id")
    args = parser.parse_args()

    if not KOSIS_API_KEY:
        raise RuntimeError(".env에 KOSIS_API_KEY가 없습니다.")

    params = {
        "method": "getMeta",
        "type": args.meta_type,
        "apiKey": KOSIS_API_KEY,
        "orgId": args.org_id,
        "tblId": args.table_id,
        "format": "json",
        "jsonVD": "Y",
    }

    response = httpx.get(
        META_URL,
        params=params,
        timeout=30,
    )
    response.raise_for_status()

    payload = parse_kosis_response(response.text)

    if isinstance(payload, list):
        rows = [
            item for item in payload
            if isinstance(item, dict)
        ]
    elif isinstance(payload, dict):
        rows = [payload]
    else:
        rows = []

    print(f"조회된 메타데이터 행 수: {len(rows)}")
    print()

    if args.show_keys and rows:
        print(f"응답 필드: {', '.join(rows[0].keys())}")
        print()
        object_counts = Counter(str(row.get("OBJ_ID", "")) for row in rows)
        print(
            "분류별 행 수: "
            + ", ".join(
                f"{object_id or 'ITEM'}={count}"
                for object_id, count in object_counts.items()
            ),
        )
        print()

    output_rows = rows
    if args.object_id:
        output_rows = [
            row for row in rows
            if str(row.get("OBJ_ID", "")) == args.object_id
        ]

    for row in output_rows[:args.limit]:
        print_row(row)


if __name__ == "__main__":
    main()
