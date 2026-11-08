"""김해 행정동 보유 기간에 맞춰 KOSIS 전국 읍면동 인구를 동기화합니다."""

import argparse
import time

from sqlalchemy import func, select

from .db import SessionLocal
from .models import (
    NationalAdministrativePopulationMonthly,
    PopulationMonthly,
    Region,
)
from .sync_kosis_admin_population import sync_month
from .services.sync_lock import database_write_lock


def validate_stats_ym(value: str) -> str:
    if len(value) != 6 or not value.isdigit():
        raise argparse.ArgumentTypeError("YYYYMM 형식으로 입력해주세요.")
    month = int(value[4:])
    if month < 1 or month > 12:
        raise argparse.ArgumentTypeError("월은 01~12여야 합니다.")
    return value


def next_month(stats_ym: str) -> str:
    year = int(stats_ym[:4])
    month = int(stats_ym[4:])
    if month == 12:
        return f"{year + 1}01"
    return f"{year}{month + 1:02d}"


def month_range(start_ym: str, end_ym: str) -> list[str]:
    if start_ym > end_ym:
        raise ValueError("시작월은 종료월보다 늦을 수 없습니다.")

    months: list[str] = []
    current = start_ym
    while current <= end_ym:
        months.append(current)
        current = next_month(current)
    return months


def get_local_admin_range() -> tuple[str, str]:
    with SessionLocal() as db:
        row = db.execute(
            select(
                func.min(PopulationMonthly.stats_ym),
                func.max(PopulationMonthly.stats_ym),
            )
            .join(Region, Region.id == PopulationMonthly.region_id)
            .where(Region.level == "admin"),
        ).one()

    if not row[0] or not row[1]:
        raise RuntimeError("김해 행정동 월별 인구 데이터가 없습니다.")
    return str(row[0]), str(row[1])


def get_existing_months() -> set[str]:
    with SessionLocal() as db:
        return set(
            db.scalars(
                select(
                    NationalAdministrativePopulationMonthly.stats_ym,
                ).distinct(),
            ).all(),
        )


@database_write_lock
def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-ym", type=validate_stats_ym)
    parser.add_argument("--to-ym", type=validate_stats_ym)
    parser.add_argument("--delay-seconds", type=float, default=1.0)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    local_start, local_end = get_local_admin_range()
    start_ym = args.from_ym or local_start
    end_ym = args.to_ym or local_end
    months = month_range(start_ym, end_ym)
    existing_months = get_existing_months()
    failures: list[tuple[str, str]] = []
    completed = 0
    skipped = 0

    print(f"동기화 범위: {start_ym}~{end_ym} ({len(months)}개월)")
    for index, stats_ym in enumerate(months, start=1):
        if not args.force and stats_ym in existing_months:
            skipped += 1
            print(f"[{index}/{len(months)}] 건너뜀 - {stats_ym} (저장 완료)")
            continue

        for attempt in range(args.retries + 1):
            try:
                raw_count, saved_count = sync_month(stats_ym)
                completed += 1
                print(
                    f"[{index}/{len(months)}] 완료 - {stats_ym}: "
                    f"원본 {raw_count}행, 읍면동 {saved_count}개",
                )
                break
            except Exception as error:  # noqa: BLE001 - 월별 실패를 기록하고 계속 진행
                if attempt >= args.retries:
                    failures.append((stats_ym, str(error)))
                    print(f"[{index}/{len(months)}] 실패 - {stats_ym}: {error}")
                    break
                wait_seconds = max(args.delay_seconds, 1.0) * (attempt + 1)
                print(
                    f"[{index}/{len(months)}] 재시도 - {stats_ym} "
                    f"({attempt + 1}/{args.retries}, {wait_seconds:.1f}초 후)",
                )
                time.sleep(wait_seconds)

        if index < len(months) and args.delay_seconds > 0:
            time.sleep(args.delay_seconds)

    print()
    print(
        f"기간 동기화 종료: 신규 {completed}개월, "
        f"건너뜀 {skipped}개월, 실패 {len(failures)}개월",
    )
    for stats_ym, message in failures:
        print(f"실패 상세 - {stats_ym}: {message}")


if __name__ == "__main__":
    main()
