"""KOSIS 전국 읍면동 월별 총인구를 SQLite에 저장합니다."""

import argparse
import os
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

from .db import Base, SessionLocal, engine
from .inspect_kosis_table import parse_kosis_response
from .repositories.population_repository import save_national_admin_population


PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")
KOSIS_API_KEY = os.getenv("KOSIS_API_KEY", "").strip()
KOSIS_DATA_URL = "https://kosis.kr/openapi/Param/statisticsParameterData.do"


def parse_population(value: object) -> int | None:
    normalized = str(value or "").replace(",", "").strip()
    if not normalized or normalized in {"-", "..."}:
        return None
    try:
        return int(float(normalized))
    except ValueError:
        return None


def build_admin_items(rows: list[dict[str, Any]]) -> list[dict[str, object]]:
    names_by_code = {
        str(row.get("C1") or "").strip(): str(row.get("C1_NM") or "").strip()
        for row in rows
        if row.get("C1") and row.get("C1_NM")
    }

    items: list[dict[str, object]] = []
    for row in rows:
        region_code = str(row.get("C1") or "").strip()
        if len(region_code) != 10 or not region_code.isdigit():
            continue

        population = parse_population(row.get("DT"))
        short_name = names_by_code.get(region_code, "")
        if population is None or not short_name:
            continue

        sido_name = names_by_code.get(region_code[:2], "")
        sigungu_name = names_by_code.get(region_code[:5], "")
        region_name = " ".join(
            name for name in (sido_name, sigungu_name, short_name) if name
        )
        items.append({
            "regionCode": region_code,
            "regionName": region_name,
            "population": population,
        })

    return items


def fetch_month(stats_ym: str) -> list[dict[str, Any]]:
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
            "objL1": "ALL",
            "objL2": "0",
            "prdSe": "M",
            "startPrdDe": stats_ym,
            "endPrdDe": stats_ym,
            "format": "json",
            "jsonVD": "Y",
        },
        timeout=120,
    )
    response.raise_for_status()
    payload = parse_kosis_response(response.text)

    if isinstance(payload, dict) and payload.get("err"):
        raise RuntimeError(
            f"KOSIS API 오류 {payload.get('err')}: {payload.get('errMsg', '')}",
        )
    if not isinstance(payload, list):
        raise RuntimeError("KOSIS가 예상하지 못한 응답을 반환했습니다.")
    return [row for row in payload if isinstance(row, dict)]


def sync_month(stats_ym: str) -> tuple[int, int]:
    rows = fetch_month(stats_ym)
    items = build_admin_items(rows)
    if not items:
        raise RuntimeError(f"{stats_ym} 전국 읍면동 인구가 조회되지 않았습니다.")

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        count = save_national_admin_population(db, stats_ym, items)
    return len(rows), count


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", required=True, type=int)
    parser.add_argument("--month", required=True, type=int, choices=range(1, 13))
    args = parser.parse_args()

    stats_ym = f"{args.year}{args.month:02d}"
    raw_count, count = sync_month(stats_ym)

    print(f"KOSIS 원본 행 수: {raw_count}")
    print(f"전국 읍면동 인구 동기화 완료: {stats_ym}, {count}개")


if __name__ == "__main__":
    main()
