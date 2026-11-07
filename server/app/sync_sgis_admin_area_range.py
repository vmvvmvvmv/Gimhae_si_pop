"""여러 연도의 SGIS 전국 행정동 경계와 면적을 SQLite에 저장합니다.

완료된 연도는 건너뛰므로 실행이 중단되어도 같은 명령으로 재개할 수 있습니다.
"""

import argparse
import asyncio
import json
from dataclasses import dataclass

from sqlalchemy import func, select

from .db import SessionLocal
from .import_national_admin_areas import import_areas
from .services.sync_lock import SyncAlreadyRunning
from .models import NationalAdministrativeArea
from .sync_sgis_admin_areas import (
    download_national_admin_areas,
    get_default_output_path,
)


@dataclass(frozen=True)
class SyncResult:
    year: int
    status: str
    feature_count: int = 0
    message: str | None = None


def get_saved_count(year: int) -> int:
    """DB에 저장된 해당 경계연도의 행정동 수를 확인합니다."""
    with SessionLocal() as db:
        return int(
            db.scalar(
                select(func.count(NationalAdministrativeArea.id)).where(
                    NationalAdministrativeArea.boundary_year == year,
                ),
            )
            or 0
        )


async def sync_year(
    year: int,
    delay_seconds: float,
    retry_count: int,
) -> SyncResult:
    """한 연도의 경계를 내려받고 원본 저장 후 면적을 DB에 반영합니다."""
    last_error: Exception | None = None
    for attempt in range(1, retry_count + 2):
        try:
            geojson = await download_national_admin_areas(
                year,
                delay_seconds,
            )
            output_path = get_default_output_path(year)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(
                json.dumps(geojson, ensure_ascii=False),
                encoding="utf-8",
            )

            feature_count = len(geojson.get("features", []))
            import_areas(
                geojson_path=output_path,
                boundary_year=year,
                code_key="adm_cd",
                name_key="adm_nm",
                parent_key=None,
                source="SGIS",
                source_crs="EPSG:5179",
            )
            saved_count = get_saved_count(year)
            return SyncResult(
                year=year,
                status="completed",
                feature_count=saved_count or feature_count,
            )
        except SyncAlreadyRunning:
            raise
        except Exception as exc:  # 연도별 실패를 기록하고 다음 연도를 계속 처리합니다.
            last_error = exc
            if attempt <= retry_count:
                wait_seconds = min(attempt * 2, 10)
                print(
                    f"{year}년 실패, {wait_seconds}초 후 재시도 "
                    f"({attempt}/{retry_count})",
                )
                await asyncio.sleep(wait_seconds)

    return SyncResult(
        year=year,
        status="failed",
        message=str(last_error) if last_error else "알 수 없는 오류",
    )


async def sync_range(args: argparse.Namespace) -> list[SyncResult]:
    results: list[SyncResult] = []
    years = list(range(args.from_year, args.to_year + 1))

    for index, year in enumerate(years, start=1):
        saved_count = get_saved_count(year)
        if not args.force and saved_count >= args.minimum_complete_count:
            print(
                f"[{index}/{len(years)}] {year}년 건너뜀 "
                f"(이미 {saved_count}개 저장)",
            )
            results.append(
                SyncResult(year, "skipped", feature_count=saved_count),
            )
            continue

        print(f"[{index}/{len(years)}] {year}년 SGIS 경계 동기화 시작")
        result = await sync_year(
            year=year,
            delay_seconds=args.delay_seconds,
            retry_count=args.retry_count,
        )
        results.append(result)

        if result.status == "completed":
            print(
                f"{year}년 완료: {result.feature_count}개 행정동 저장",
            )
        else:
            print(f"{year}년 실패: {result.message}")

        if args.year_delay_seconds and index < len(years):
            await asyncio.sleep(args.year_delay_seconds)

    return results


def validate_args(args: argparse.Namespace) -> None:
    if args.from_year > args.to_year:
        raise ValueError("--from-year는 --to-year보다 클 수 없습니다.")
    if args.minimum_complete_count < 1:
        raise ValueError("--minimum-complete-count는 1 이상이어야 합니다.")
    if args.retry_count < 0:
        raise ValueError("--retry-count는 0 이상이어야 합니다.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="SGIS 전국 행정동 경계를 연도 범위로 동기화합니다.",
    )
    parser.add_argument("--from-year", type=int, default=2013)
    parser.add_argument("--to-year", type=int, required=True)
    parser.add_argument("--delay-seconds", type=float, default=0.3)
    parser.add_argument("--year-delay-seconds", type=float, default=1.0)
    parser.add_argument("--retry-count", type=int, default=2)
    parser.add_argument(
        "--minimum-complete-count",
        type=int,
        default=3000,
        help="이 개수 이상 저장된 연도는 완료로 보고 건너뜁니다.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="이미 완료된 연도도 다시 내려받습니다.",
    )
    args = parser.parse_args()
    validate_args(args)

    results = asyncio.run(sync_range(args))
    completed = sum(result.status == "completed" for result in results)
    skipped = sum(result.status == "skipped" for result in results)
    failed = [result for result in results if result.status == "failed"]

    print("\nSGIS 연도 범위 동기화 결과")
    print(f"새로 완료: {completed}개 연도")
    print(f"기존 완료 건너뜀: {skipped}개 연도")
    print(f"실패: {len(failed)}개 연도")
    for result in failed:
        print(f"- {result.year}: {result.message}")


if __name__ == "__main__":
    main()
