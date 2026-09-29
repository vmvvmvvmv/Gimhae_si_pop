"""주민등록 인구통계 홈페이지의 과거 행정동 데이터를 SQLite에 저장합니다."""

import argparse
import csv
import io
import re
import time
from datetime import date, timedelta
from typing import Any

import httpx
from sqlalchemy import select

from .db import SessionLocal
from .models import Region
from .services.population_sync_service import save_local_population_result


JUMIN_BASE_URL = "https://jumin.mois.go.kr"
ADMIN_SUMMARY_DOWNLOAD = (
    f"{JUMIN_BASE_URL}/downloadCsv.do?searchYearMonth=month&xlsStats=1"
)
ADMIN_AGE_DOWNLOAD = (
    f"{JUMIN_BASE_URL}/downloadCsvAge.do?searchYearMonth=month&xlsStats=3"
)
REGION_CODE_PATTERN = re.compile(r"\((\d{10})\)\s*$")
AGE_LABELS = (
    "0-9세",
    "10-19세",
    "20-29세",
    "30-39세",
    "40-49세",
    "50-59세",
    "60-69세",
    "70-79세",
    "80-89세",
    "90-99세",
    "100세 이상",
)


def iter_months(
    from_year: int,
    from_month: int,
    to_year: int,
    to_month: int,
):
    current = from_year * 12 + from_month - 1
    end = to_year * 12 + to_month - 1

    while current <= end:
        yield current // 12, current % 12 + 1
        current += 1


def latest_completed_month() -> tuple[int, int]:
    first_day = date.today().replace(day=1)
    last_month = first_day - timedelta(days=1)
    return last_month.year, last_month.month


def decode_csv(content: bytes) -> str:
    candidates: list[tuple[int, str]] = []
    for encoding in ("cp949", "euc-kr", "utf-8-sig", "utf-8"):
        text = content.decode(encoding, errors="replace")
        hangul_count = sum("가" <= char <= "힣" for char in text)
        replacement_count = text.count("�")
        candidates.append((hangul_count - replacement_count * 10, text))
    return max(candidates, key=lambda item: item[0])[1]


def parse_rows(content: bytes) -> list[list[str]]:
    text = decode_csv(content)
    return [
        [cell.strip() for cell in row]
        for row in csv.reader(io.StringIO(text))
        if row and any(cell.strip() for cell in row)
    ]


def extract_code(value: str) -> str | None:
    match = REGION_CODE_PATTERN.search(value)
    return match.group(1) if match else None


def to_int(value: Any) -> int:
    normalized = str(value or "").replace(",", "").strip()
    try:
        return int(float(normalized))
    except (TypeError, ValueError):
        return 0


def build_form(year: int, month: int) -> dict[str, str]:
    return {
        "sltOrgType": "2",
        "sltOrgLvl1": "4800000000",
        "sltOrgLvl2": "4825000000",
        "gender": "gender",
        "genderPer": "genderPer",
        "generation": "generation",
        "sum": "sum",
        "sltUndefType": "",
        "searchYearStart": str(year),
        "searchMonthStart": f"{month:02d}",
        "searchYearEnd": str(year),
        "searchMonthEnd": f"{month:02d}",
        "sltOrderType": "1",
        "sltOrderValue": "ASC",
        "sltArgTypes": "10",
        "sltArgTypeA": "0",
        "sltArgTypeB": "100",
        "category": "month",
        "state": "1",
    }


def download_csv(
    client: httpx.Client,
    url: str,
    year: int,
    month: int,
) -> list[list[str]]:
    response = client.post(
        url,
        data=build_form(year, month),
        timeout=120,
    )
    response.raise_for_status()
    return parse_rows(response.content)


def parse_summary(rows: list[list[str]]) -> dict[str, dict[str, int | float]]:
    parsed: dict[str, dict[str, int | float]] = {}
    for row in rows[1:]:
        if len(row) < 6:
            continue
        code = extract_code(row[0])
        if not code:
            continue
        try:
            per_household = float(row[3].replace(",", "").strip() or 0)
        except ValueError:
            per_household = 0
        parsed[code] = {
            "population": to_int(row[1]),
            "households": to_int(row[2]),
            "populationPerHousehold": per_household,
            "malePopulation": to_int(row[4]),
            "femalePopulation": to_int(row[5]),
        }
    return parsed


def parse_age(rows: list[list[str]]) -> dict[str, list[dict[str, int | str]]]:
    parsed: dict[str, list[dict[str, int | str]]] = {}
    for row in rows[1:]:
        if len(row) < 40:
            continue
        code = extract_code(row[0])
        if not code:
            continue

        distributions = []
        for index, label in enumerate(AGE_LABELS):
            distributions.append({
                "ageGroup": label,
                "population": to_int(row[3 + index]),
                "malePopulation": to_int(row[16 + index]),
                "femalePopulation": to_int(row[29 + index]),
            })
        parsed[code] = distributions
    return parsed


def load_admin_regions() -> dict[str, str]:
    with SessionLocal() as db:
        rows = db.scalars(
            select(Region).where(
                Region.level == "admin",
                Region.is_active.is_(True),
            ),
        )
        return {row.region_code: row.region_name for row in rows}


def sync_month(
    client: httpx.Client,
    regions: dict[str, str],
    year: int,
    month: int,
) -> tuple[int, int]:
    summary = parse_summary(
        download_csv(client, ADMIN_SUMMARY_DOWNLOAD, year, month),
    )
    age = parse_age(
        download_csv(client, ADMIN_AGE_DOWNLOAD, year, month),
    )

    items: list[dict[str, Any]] = []
    missing_count = 0
    for code, name in regions.items():
        summary_item = summary.get(code)
        if not summary_item:
            missing_count += 1
            continue
        items.append({
            "regionCode": code,
            "regionName": name,
            **summary_item,
            "ageDistribution": age.get(code, []),
        })

    result = {
        "level": "admin",
        "year": year,
        "month": month,
        "items": items,
        "source": "MOIS_WEB",
    }
    with SessionLocal.begin() as db:
        saved_count = save_local_population_result(db, result)
    return saved_count, missing_count


def sync_history(
    from_year: int,
    from_month: int,
    to_year: int,
    to_month: int,
    delay_seconds: float,
) -> None:
    regions = load_admin_regions()
    if not regions:
        raise RuntimeError(
            "DB에 행정동이 없습니다. 먼저 python -m app.init_db를 실행하세요.",
        )

    with httpx.Client(
        follow_redirects=True,
        headers={"User-Agent": "GimhaePopulationMap/1.0"},
    ) as client:
        client.get(f"{JUMIN_BASE_URL}/statMonth.do", timeout=30)
        client.get(f"{JUMIN_BASE_URL}/ageStatMonth.do", timeout=30)

        for year, month in iter_months(
            from_year,
            from_month,
            to_year,
            to_month,
        ):
            try:
                saved_count, missing_count = sync_month(
                    client,
                    regions,
                    year,
                    month,
                )
                print(
                    f"{year}-{month:02d}: {saved_count}개 행정동 저장"
                    f" (자료 누락 {missing_count}개)",
                )
            except (httpx.HTTPError, ValueError) as error:
                print(f"{year}-{month:02d}: 수집 실패 - {error}")

            if delay_seconds > 0:
                time.sleep(delay_seconds)


def main() -> None:
    latest_year, latest_month = latest_completed_month()
    parser = argparse.ArgumentParser(
        description="2013년 7월 이후 행정동 주민등록 인구를 저장합니다.",
    )
    parser.add_argument("--from-year", type=int, default=2013)
    parser.add_argument("--from-month", type=int, default=7)
    parser.add_argument("--to-year", type=int, default=latest_year)
    parser.add_argument("--to-month", type=int, default=latest_month)
    parser.add_argument("--delay-seconds", type=float, default=0.8)
    args = parser.parse_args()

    if not 1 <= args.from_month <= 12 or not 1 <= args.to_month <= 12:
        raise SystemExit("월은 1부터 12까지 입력해야 합니다.")

    start = args.from_year * 12 + args.from_month
    end = args.to_year * 12 + args.to_month
    if start > end:
        raise SystemExit("시작 연월은 종료 연월보다 빠르거나 같아야 합니다.")

    sync_history(
        args.from_year,
        args.from_month,
        args.to_year,
        args.to_month,
        args.delay_seconds,
    )


if __name__ == "__main__":
    main()
