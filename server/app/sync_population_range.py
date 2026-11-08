import argparse
import asyncio
import re

from .core.config import MOIS_SERVICE_KEY
from .db import SessionLocal
from .services.mois_client import MoisClient
from .services.population_sync_service import save_local_population_result
from .services.population_service import (
    PopulationLevel,
    get_region_population_range,
    load_regions,
)
from .services.sync_lock import sync_lock


def safe_error_text(error: object) -> str:
    return re.sub(
        r"(?i)(serviceKey=)[^&\s]+",
        r"\1[REDACTED]",
        str(error),
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
    expected_codes = {region["code"] for region in load_regions(level)}
    if not expected_codes:
        raise RuntimeError("동기화할 지역 코드가 없습니다.")
    had_failure = False

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
            for year, month in iter_months(
                chunk_from_year, chunk_from_month, chunk_to_year, chunk_to_month,
            ):
                stats_ym = f"{year}{month:02d}"
                result = results.get(stats_ym)
                if result is None:
                    had_failure = True
                    print(f"{year}-{month:02d}: 응답 데이터 없음, 저장하지 않음")
                    continue

                failed_regions = result["meta"].get("failedRegions", [])
                failed_count = result["meta"].get("failedRegionCount", 0)
                if failed_count:
                    had_failure = True
                    print(f"{year}-{month:02d}: {failed_count}개 지역 실패, 저장하지 않음")
                for failed in failed_regions[:5]:
                    print(
                        f"실패 상세 - {failed['regionName']} "
                        f"({failed['regionCode']}): {safe_error_text(failed['error'])}",
                    )
                if failed_count:
                    continue

                items = result["items"]
                codes = [item["regionCode"] for item in items]
                missing = expected_codes - set(codes)
                extra = set(codes) - expected_codes
                if missing or extra or len(codes) != len(expected_codes):
                    had_failure = True
                    print(
                        f"{year}-{month:02d}: 지역 응답 불완전 "
                        f"(누락 {len(missing)}개, 예상 외 {len(extra)}개), 저장하지 않음",
                    )
                    continue
                if any(
                    not item.get("sourceRowCount") or not item.get("ageSourceRowCount")
                    for item in items
                ):
                    had_failure = True
                    print(f"{year}-{month:02d}: 인구 또는 연령별 원본 행 누락, 저장하지 않음")
                    continue

                with SessionLocal.begin() as db:
                    saved_count = save_local_population_result(db, result)
                    if saved_count != len(expected_codes):
                        raise RuntimeError(
                            f"지역 저장 건수 불일치: {saved_count}/{len(expected_codes)}"
                        )
                level_name = "행정동" if level == "admin" else "법정동"
                print(f"{year}-{month:02d}: {saved_count}개 {level_name} 저장, 0개 실패")
        except Exception as error:
            had_failure = True
            print(
                f"{chunk_from_year}-{chunk_from_month:02d}~"
                f"{chunk_to_year}-{chunk_to_month:02d}: 수집 실패 - {safe_error_text(error)}",
            )

        if delay_seconds > 0:
            await asyncio.sleep(delay_seconds)

    if had_failure:
        raise RuntimeError("일부 지역 또는 기간의 동기화 실패. 위 실패 상세를 확인하세요.")


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

    with sync_lock("database"):
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
