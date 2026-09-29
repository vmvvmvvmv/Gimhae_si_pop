import argparse
import asyncio
from datetime import datetime

from .core.config import MOIS_SERVICE_KEY
from .db import SessionLocal
from .services.mois_client import MoisClient
from .services.national_population_service import (
    fetch_national_population,
    validate_national_result,
)
from .services.population_sync_service import save_national_population_result


def month_sequence(from_year: int, from_month: int, to_year: int, to_month: int):
    current = from_year * 12 + from_month - 1
    end = to_year * 12 + to_month - 1
    while current <= end:
        yield current // 12, current % 12 + 1
        current += 1


async def sync(args: argparse.Namespace) -> None:
    if not MOIS_SERVICE_KEY:
        raise RuntimeError(".env에 MOIS_SERVICE_KEY가 설정되지 않았습니다.")

    client = MoisClient(MOIS_SERVICE_KEY)
    saved_count = 0

    for year, month in month_sequence(
        args.from_year,
        args.from_month,
        args.to_year,
        args.to_month,
    ):
        stats_ym = f"{year}{month:02d}"
        try:
            result = await fetch_national_population(client, stats_ym)
            validate_national_result(result)
        except Exception as error:
            print(f"실패 - {stats_ym}: {error}")
            continue

        with SessionLocal.begin() as db:
            save_national_population_result(db, stats_ym, result.population)
        saved_count += 1
        print(
            f"저장 완료 - {stats_ym}: "
            f"{result.population:,}명 ({result.source_row_count}개 행)",
        )
        if args.delay_seconds > 0:
            await asyncio.sleep(args.delay_seconds)

    print(f"전국 인구 API 동기화 완료: {saved_count}개월")
    print(f"완료 시각: {datetime.now().isoformat(timespec='seconds')}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="행정안전부 API에서 전국 월별 주민등록 인구를 SQLite에 저장합니다.",
    )
    parser.add_argument("--from-year", type=int, required=True)
    parser.add_argument("--from-month", type=int, required=True, choices=range(1, 13))
    parser.add_argument("--to-year", type=int, required=True)
    parser.add_argument("--to-month", type=int, required=True, choices=range(1, 13))
    parser.add_argument("--delay-seconds", type=float, default=0.8)
    return parser.parse_args()


if __name__ == "__main__":
    asyncio.run(sync(parse_args()))
