"""VWorld 법정동 GeoJSON의 면적을 계산해 SQLite에 저장합니다."""

import argparse
import json
from pathlib import Path

from pyproj import CRS, Transformer
from shapely.geometry import shape
from shapely.ops import transform
from sqlalchemy import select

from .core.time import utc_now
from .db import SessionLocal
from .models import NationalLegalArea
from .services.sync_lock import database_write_lock


@database_write_lock
def import_legal_areas(
    geojson_path: Path,
    reference_year: int,
) -> int:
    geojson = json.loads(geojson_path.read_text(encoding="utf-8-sig"))
    transformer = Transformer.from_crs(
        CRS.from_epsg(4326),
        CRS.from_epsg(5179),
        always_xy=True,
    )
    processed_count = 0

    with SessionLocal.begin() as db:
        for feature in geojson.get("features", []):
            properties = feature.get("properties", {})
            region_code = str(properties.get("emd_cd", "")).strip()
            region_name = str(
                properties.get("full_nm")
                or properties.get("emd_kor_nm")
                or "",
            ).strip()
            geometry_data = feature.get("geometry")
            if not region_code or not region_name or not geometry_data:
                continue

            geometry = shape(geometry_data)
            projected_geometry = transform(transformer.transform, geometry)
            area_km2 = round(float(projected_geometry.area) / 1_000_000, 2)
            if area_km2 <= 0:
                continue

            row = db.scalar(
                select(NationalLegalArea).where(
                    NationalLegalArea.reference_year == reference_year,
                    NationalLegalArea.region_code == region_code,
                ),
            )
            if row is None:
                row = NationalLegalArea(
                    reference_year=reference_year,
                    region_code=region_code,
                )
                db.add(row)

            row.region_name = region_name
            row.parent_code = region_code[:5]
            row.area_km2 = area_km2
            row.source = "VWORLD"
            row.fetched_at = utc_now()
            processed_count += 1

    return processed_count


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--geojson", required=True, type=Path)
    parser.add_argument("--reference-year", required=True, type=int)
    args = parser.parse_args()

    if not args.geojson.exists():
        raise FileNotFoundError(f"GeoJSON 파일을 찾을 수 없습니다: {args.geojson}")

    count = import_legal_areas(args.geojson, args.reference_year)
    print(f"VWorld 법정동 면적 동기화 완료: {count}개")


if __name__ == "__main__":
    main()
