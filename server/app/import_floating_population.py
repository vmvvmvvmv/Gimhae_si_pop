import argparse
import csv
import statistics
from collections import defaultdict
from pathlib import Path
from sqlalchemy import select

from .db import SessionLocal
from .models import FloatingPopulationMonthly, Region


FIELD_ALIASES = {
    "year": ("기준_년", "기준년", "기준년도", "year"),
    "month": ("기준_월", "기준월", "month"),
    "region_code": ("행정동_코드", "행정동코드", "읍면동_코드"),
    "service": ("서비스인구", "서비스 인구", "service_population"),
    "residential": ("주거인구", "주거 인구", "residential_population"),
    "workplace": ("직장인구", "직장 인구", "workplace_population"),
    "visitor": ("방문인구", "방문 인구", "visitor_population"),
}


def normalize_key(value: str) -> str:
    return value.replace("﻿", "").replace(" ", "").strip().lower()


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    last_error: UnicodeDecodeError | None = None

    for encoding in ("utf-8-sig", "cp949", "euc-kr"):
        try:
            with path.open("r", encoding=encoding, newline="") as file:
                return list(csv.DictReader(file))
        except UnicodeDecodeError as error:
            last_error = error

    raise ValueError(
        f"CSV 인코딩을 확인할 수 없습니다: {path}",
    ) from last_error


def get_value(row: dict[str, str], aliases: tuple[str, ...]) -> str:
    normalized = {
        normalize_key(key): value or ""
        for key, value in row.items()
        if key is not None
    }

    for alias in aliases:
        value = normalized.get(normalize_key(alias))
        if value is not None:
            return value.strip()

    return ""


def to_int(value: str) -> int:
    try:
        return int(float(value.replace(",", "").strip() or "0"))
    except (TypeError, ValueError):
        return 0


def to_stats_ym(row: dict[str, str]) -> str:
    year = to_int(get_value(row, FIELD_ALIASES["year"]))
    month = to_int(get_value(row, FIELD_ALIASES["month"]))

    if not 2000 <= year <= 2100 or not 1 <= month <= 12:
        raise ValueError("기준 연월을 확인할 수 없는 행이 있습니다.")

    return f"{year}{month:02d}"


def collect_monthly_values(
    rows: list[dict[str, str]],
) -> dict[tuple[str, str], dict[str, list[int]]]:
    values: dict[tuple[str, str], dict[str, list[int]]] = defaultdict(
        lambda: defaultdict(list),
    )

    for row in rows:
        region_code = get_value(row, FIELD_ALIASES["region_code"])
        if not region_code:
            continue

        stats_ym = to_stats_ym(row)
        key = (region_code, stats_ym)
        for field_name in ("service", "residential", "workplace", "visitor"):
            values[key][field_name].append(
                to_int(get_value(row, FIELD_ALIASES[field_name])),
            )

    return values


def monthly_average(values: list[int]) -> int:
    return round(statistics.fmean(values)) if values else 0


def import_rows(
    path: Path,
    dry_run: bool,
) -> tuple[int, int]:
    rows = read_csv_rows(path)
    grouped = collect_monthly_values(rows)

    if dry_run:
        print(f"CSV 행 수: {len(rows)}")
        print(f"행정동·월 조합 수: {len(grouped)}")
        for (region_code, stats_ym), values in list(grouped.items())[:3]:
            print(
                f"미리보기 - {region_code} {stats_ym}: "
                f"서비스인구 평균 {monthly_average(values['service'])}",
            )
        return len(rows), 0

    saved_count = 0
    skipped_count = 0

    with SessionLocal.begin() as db:
        for (region_code, stats_ym), values in grouped.items():
            region = db.scalar(
                select(Region).where(
                    Region.level == "admin",
                    Region.region_code == region_code,
                ),
            )
            if not region:
                skipped_count += 1
                continue

            floating = db.scalar(
                select(FloatingPopulationMonthly).where(
                    FloatingPopulationMonthly.region_id == region.id,
                    FloatingPopulationMonthly.stats_ym == stats_ym,
                ),
            )
            if not floating:
                floating = FloatingPopulationMonthly(
                    region_id=region.id,
                    stats_ym=stats_ym,
                )
                db.add(floating)

            floating.service_population = monthly_average(values["service"])
            floating.residential_population = monthly_average(
                values["residential"],
            )
            floating.workplace_population = monthly_average(
                values["workplace"],
            )
            floating.visitor_population = monthly_average(values["visitor"])
            floating.source = "GIMHAE_PUBLIC_DATA_15109694"
            floating.note = "원자료 행 기준 월별 평균"
            saved_count += 1

    print(f"지역 코드 불일치로 건너뛴 조합 수: {skipped_count}")
    return len(rows), saved_count


def main() -> None:
    parser = argparse.ArgumentParser(
        description="김해시 유동인구 CSV를 SQLite에 저장합니다.",
    )
    parser.add_argument("--file", type=Path, required=True)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="DB에 저장하지 않고 CSV 구조와 일부 데이터를 확인합니다.",
    )
    args = parser.parse_args()

    if not args.file.exists():
        raise SystemExit(f"CSV 파일을 찾을 수 없습니다: {args.file}")

    rows_count, saved_count = import_rows(args.file, args.dry_run)
    if not args.dry_run:
        print(f"CSV 행 수: {rows_count}")
        print(f"저장된 행정동·월 조합 수: {saved_count}")


if __name__ == "__main__":
    main()
