import argparse
import asyncio

from .core.config import MOIS_SERVICE_KEY
from .db import SessionLocal
from .services.mois_client import MoisClient
from .services.population_sync_service import save_local_population_result
from .services.population_service import (
    PopulationLevel,
    get_region_population,
)


async def sync_population(
    level: PopulationLevel,
    year: int,
    month: int,
) -> None:
    if not MOIS_SERVICE_KEY:
        raise RuntimeError("MOIS_SERVICE_KEY가 설정되지 않았습니다.")

    mois_client = MoisClient(MOIS_SERVICE_KEY)
    result = await get_region_population(
        mois_client,
        level,
        year,
        month,
    )

    with SessionLocal.begin() as db:
        saved_count = save_local_population_result(db, result)

    level_name = "행정동" if level == "admin" else "법정동"
    print(f"{year}년 {month}월 {level_name} 인구 데이터 동기화 완료")
    print(f"저장된 {level_name} 수: {saved_count}")
    print(f"실패한 {level_name} 수: {result['meta']['failedRegionCount']}")

    failed_regions = result["meta"].get("failedRegions", [])
    for failed in failed_regions[:5]:
        print(
            f"실패 상세 - {failed['regionName']} "
            f"({failed['regionCode']}): {failed['error']}",
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="행정안전부 인구 데이터를 SQLite에 저장합니다.",
    )
    parser.add_argument(
        "--level",
        choices=("admin", "legal"),
        default="admin",
    )
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--month", type=int, required=True)
    args = parser.parse_args()

    if not 1 <= args.month <= 12:
        raise SystemExit("month는 1부터 12까지 입력해야 합니다.")

    asyncio.run(sync_population(args.level, args.year, args.month))


if __name__ == "__main__":
    main()
