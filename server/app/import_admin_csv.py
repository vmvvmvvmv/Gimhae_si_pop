"""주민등록 인구통계 사이트에서 내려받은 행정동 CSV를 SQLite에 저장합니다."""

import argparse
from pathlib import Path
from typing import Any

from sqlalchemy import select

from .db import SessionLocal
from .models import Region
from .services.population_sync_service import save_local_population_result
from .services.sync_lock import database_write_lock
from .sync_population_history import parse_age, parse_rows, parse_summary


def load_admin_regions() -> dict[str, str]:
    with SessionLocal() as db:
        regions = db.scalars(
            select(Region).where(
                Region.level == "admin",
                Region.is_active.is_(True),
            ),
        )
        return {region.region_code: region.region_name for region in regions}


def build_result(
    stats_ym: str,
    summary_csv: Path,
    age_csv: Path | None,
) -> tuple[dict[str, Any], int]:
    regions = load_admin_regions()
    summary = parse_summary(
        parse_rows(summary_csv.read_bytes()),
    )
    age = (
        parse_age(parse_rows(age_csv.read_bytes()))
        if age_csv
        else {}
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
        "year": int(stats_ym[:4]),
        "month": int(stats_ym[4:]),
        "items": items,
        "source": "MOIS_WEB_MANUAL",
    }
    return result, missing_count


@database_write_lock
def main() -> None:
    parser = argparse.ArgumentParser(
        description="다운로드한 행정동 CSV를 SQLite에 저장합니다.",
    )
    parser.add_argument(
        "--stats-ym",
        required=True,
        help="통계 연월. 예: 201307",
    )
    parser.add_argument(
        "--summary-csv",
        required=True,
        type=Path,
        help="행정동 주민등록 인구 및 세대현황 CSV 경로",
    )
    parser.add_argument(
        "--age-csv",
        type=Path,
        help="선택 사항: 행정동 연령별 인구현황 CSV 경로",
    )
    args = parser.parse_args()

    if (
        len(args.stats_ym) != 6
        or not args.stats_ym.isdigit()
        or not 1 <= int(args.stats_ym[4:]) <= 12
    ):
        raise SystemExit("--stats-ym은 YYYYMM 형식이어야 합니다. 예: 201307")
    if not args.summary_csv.exists():
        raise SystemExit(f"요약 CSV를 찾을 수 없습니다: {args.summary_csv}")
    if args.age_csv and not args.age_csv.exists():
        raise SystemExit(f"연령별 CSV를 찾을 수 없습니다: {args.age_csv}")

    result, missing_count = build_result(
        args.stats_ym,
        args.summary_csv,
        args.age_csv,
    )
    with SessionLocal.begin() as db:
        saved_count = save_local_population_result(db, result)

    print(f"{args.stats_ym}: {saved_count}개 행정동 저장")
    print(f"GeoJSON과 매칭되지 않은 행정동: {missing_count}개")
    print(
        "연령별 CSV: "
        f"{'포함' if args.age_csv else '미포함'}",
    )


if __name__ == "__main__":
    main()
