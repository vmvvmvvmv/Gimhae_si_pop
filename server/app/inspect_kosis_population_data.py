"""KOSIS 읍면동 인구 통계표의 실제 응답 구조를 확인합니다."""

import argparse
import json
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv

from .inspect_kosis_table import parse_kosis_response


PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")
KOSIS_API_KEY = os.getenv("KOSIS_API_KEY", "").strip()
KOSIS_DATA_URL = "https://kosis.kr/openapi/Param/statisticsParameterData.do"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--region-code", default="1111051500")
    parser.add_argument("--stats-ym", default="202512")
    args = parser.parse_args()

    if not KOSIS_API_KEY:
        raise RuntimeError(".env에 KOSIS_API_KEY가 없습니다.")

    response = httpx.get(
        KOSIS_DATA_URL,
        params={
            "method": "getList",
            "apiKey": KOSIS_API_KEY,
            "orgId": "101",
            "tblId": "DT_1B04005N",
            "itmId": "T2",
            "objL1": args.region_code,
            "objL2": "0",
            "prdSe": "M",
            "startPrdDe": args.stats_ym,
            "endPrdDe": args.stats_ym,
            "format": "json",
            "jsonVD": "Y",
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = parse_kosis_response(response.text)
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
