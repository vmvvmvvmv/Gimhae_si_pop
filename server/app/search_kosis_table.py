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
SEARCH_URL = "https://kosis.kr/openapi/statisticsSearch.do"


def main() -> None:
    if not KOSIS_API_KEY:
        raise RuntimeError(".env에 KOSIS_API_KEY가 없습니다.")

    params = {
        "method": "getList",
        "apiKey": KOSIS_API_KEY,
        "searchNm": "행정구역별 지목별 국토이용현황",
        "sort": "RANK",
        "startCount": "1",
        "resultCount": "20",
        "format": "json",
    }

    response = httpx.get(
        SEARCH_URL,
        params=params,
        timeout=30,
    )
    response.raise_for_status()

    raw_text = response.text.lstrip("\ufeff")

    if raw_text.startswith("<"):
        raise RuntimeError("KOSIS가 HTML 오류 페이지를 반환했습니다.")

    normalized_text = re.sub(
        r"([,{])\s*([A-Za-z][A-Za-z0-9_]*)\s*:",
        r'\1"\2":',
        raw_text,
    )

    results: list[dict[str, Any]] = json.loads(normalized_text)

    if not results:
        print("검색 결과가 없습니다.")
        return

    for index, item in enumerate(results, start=1):
        print(f"[{index}] {item.get('TBL_NM', '')}")
        print(f"    기관코드: {item.get('ORG_ID', '')}")
        print(f"    통계표ID: {item.get('TBL_ID', '')}")
        print(f"    주기: {item.get('PRD_SE', '')}")
        print()


if __name__ == "__main__":
    main()