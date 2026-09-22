import argparse

from .db import SessionLocal
from .repositories.population_repository import save_national_area


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

    with SessionLocal() as db: # SQLite DB 연결
        row = save_national_area( #Resposity 함수 호출 후 데이터 저장
            db=db,
            year=args.year,
            area_km2=args.area_km2,
            source=args.source,
        )

    print(
        f"저장 완료 - {row.year}년: "
        f"{row.area_km2:,.4f}km² "
        f"(출처: {row.source})",
    )


if __name__ == "__main__":
    main()