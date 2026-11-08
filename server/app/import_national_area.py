import argparse

from .db import SessionLocal
from .services.population_sync_service import save_national_area_result
from .services.sync_lock import database_write_lock


@database_write_lock
def main() -> None:
    parser = argparse.ArgumentParser(
        description="연도별 대한민국 국토면적을 SQLite에 저장합니다.",
    )
    parser.add_argument("--year", type=int, required=True) # cmd 연도 받기
    parser.add_argument("--area-km2", type=float, required=True) # 국토 면적 받기
    parser.add_argument("--source", default="KOSIS")

    args = parser.parse_args()

    if args.area_km2 <= 0:
        raise ValueError("면적은 0보다 커야 합니다.")

    with SessionLocal.begin() as db: # SQLite DB 연결
        row = save_national_area_result(
            db=db,
            year=args.year,
            area_km2=args.area_km2,
            source=args.source,
        )
        saved_year = row.year
        saved_area_km2 = row.area_km2
        saved_source = row.source

    print(
        f"저장 완료 - {saved_year}년: "
        f"{saved_area_km2:,.4f}km² "
        f"(출처: {saved_source})",
    )


if __name__ == "__main__":
    main()
