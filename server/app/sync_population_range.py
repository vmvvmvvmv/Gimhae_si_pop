import argparse
import asyncio

from .core.config import MOIS_SERVICE_KEY
from .db import SessionLocal
from .repositories.population_repository import save_population
from .services.mois_client import MoisClient
from .services.population_service import (
    PopulationLevel,
    get_region_population_range,
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


def iter_month_ranges(
    from_year: int,
    from_month: int,
    to_year: int,
    to_month: int,
    size: int = 3,
):
    start = from_year * 12 + from_month - 1
    end = to_year * 12 + to_month - 1
    while start <= end:
        chunk_end = min(start + size - 1, end)
        yield (
            start // 12,
            start % 12 + 1,
            chunk_end // 12,
            chunk_end % 12 + 1,
        )
        start = chunk_end + 1


async def sync_range(
    level: PopulationLevel,
    from_year: int,
    from_month: int,
    to_year: int,
    to_month: int,
    delay_seconds: float,
) -> None:
    if not MOIS_SERVICE_KEY:
        raise RuntimeError("MOIS_SERVICE_KEY가 설정되지 않았습니다.")

    mois_client = MoisClient(MOIS_SERVICE_KEY)

    for (
        chunk_from_year,
        chunk_from_month,
        chunk_to_year,
        chunk_to_month,
    ) in iter_month_ranges(
        from_year,
        from_month,
        to_year,
        to_month,
    ):
        try:
            results = await get_region_population_range(
                mois_client,
                level,
                chunk_from_year,
                chunk_from_month,
                chunk_to_year,
                chunk_to_month,
            )
            for stats_ym in sorted(results):
                result = results[stats_ym]
                with SessionLocal() as db:
                    saved_count = save_population(db, result)

                level_name = "행정동" if level == "admin" else "법정동"
                print(
                    f"{result['year']}-{result['month']:02d}: "
                    f"{saved_count}개 {level_name} 저장, "
                    f"{result['meta'].get('failedRegionCount', 0)}개 실패",
                )
        except Exception as error:
            print(
                f"{chunk_from_year}-{chunk_from_month:02d}~"
                f"{chunk_to_year}-{chunk_to_month:02d}: 수집 실패 - {error}",
            )

        if delay_seconds > 0:
            await asyncio.sleep(delay_seconds)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="기간 범위의 행정안전부 인구 데이터를 SQLite에 저장합니다.",
    )
    parser.add_argument(
        "--level",
        choices=("admin", "legal"),
        default="admin",
    )
    parser.add_argument("--from-year", type=int, required=True)
    parser.add_argument("--from-month", type=int, required=True)
    parser.add_argument("--to-year", type=int, required=True)
    parser.add_argument("--to-month", type=int, required=True)
    parser.add_argument("--delay-seconds", type=float, default=0.5)
    args = parser.parse_args()

    months = (
        args.from_month,
        args.to_month,
    )
    if any(month < 1 or month > 12 for month in months):
        raise SystemExit("월은 1부터 12까지 입력해야 합니다.")

    start = args.from_year * 12 + args.from_month
    end = args.to_year * 12 + args.to_month
    if start > end:
        raise SystemExit("시작 연월은 종료 연월보다 빠르거나 같아야 합니다.")

    asyncio.run(sync_range(
        args.level,
        args.from_year,
        args.from_month,
        args.to_year,
        args.to_month,
        args.delay_seconds,
    ))


if __name__ == "__main__":
    main()
