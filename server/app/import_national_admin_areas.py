"""전국 행정동 GeoJSON을 읽어 면적을 계산하고 SQLite에 저장합니다."""

import argparse
import json
from pathlib import Path

from pyproj import CRS, Transformer
from shapely.geometry import shape
from shapely.ops import transform
from sqlalchemy import select

from .db import SessionLocal
from .core.time import utc_now
from .models import NationalAdministrativeArea
from .services.sync_lock import database_write_lock


def get_source_crs(geojson: dict, fallback_crs: str) -> CRS:
    crs_name = str(
        geojson.get("crs", {})
        .get("properties", {})
        .get("name", ""),
    )
    if "5179" in crs_name:
        return CRS.from_epsg(5179)
    if "5186" in crs_name:
        return CRS.from_epsg(5186)
    # SGIS hadmarea.geojson 응답에는 CRS 정보가 없을 수 있습니다.
    # SGIS 행정구역 경계의 좌표계는 UTM-K(EPSG:5179)이므로
    # 호출 원본에 맞는 기본 좌표계를 명시적으로 사용합니다.
    return CRS.from_user_input(fallback_crs)


@database_write_lock
def import_areas(
    geojson_path: Path,
    boundary_year: int,
    code_key: str,
    name_key: str,
    parent_key: str | None,
    source: str,
    source_crs: str,
) -> int:
    geojson = json.loads(geojson_path.read_text(encoding="utf-8-sig"))
    detected_crs = get_source_crs(geojson, source_crs)
    transformer = Transformer.from_crs(
        detected_crs,
        CRS.from_epsg(5179),
        always_xy=True,
    )
    saved_count = 0

    with SessionLocal.begin() as db:
        for feature in geojson.get("features", []):
            properties = feature.get("properties", {})
            region_code = str(properties.get(code_key, "")).strip()
            region_name = str(properties.get(name_key, "")).strip()
            if not region_code or not region_name:
                continue

            geometry = shape(feature.get("geometry"))
            area_km2 = round(
                float(transform(transformer.transform, geometry).area) / 1_000_000,
                2,
            )
            row = db.scalar(
                select(NationalAdministrativeArea).where(
                    NationalAdministrativeArea.boundary_year == boundary_year,
                    NationalAdministrativeArea.region_code == region_code,
                ),
            )
            if row is None:
                row = NationalAdministrativeArea(
                    boundary_year=boundary_year,
                    region_code=region_code,
                )
                db.add(row)
                saved_count += 1

            row.region_name = region_name
            row.parent_code = (
                str(properties.get(parent_key, "")).strip()
                if parent_key
                else None
            ) or None
            row.area_km2 = area_km2
            row.source = source
            row.fetched_at = utc_now()

    return saved_count


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--geojson", required=True, type=Path)
    parser.add_argument("--boundary-year", required=True, type=int)
    parser.add_argument("--code-key", default="adm_cd")
    parser.add_argument("--name-key", default="adm_nm")
    parser.add_argument("--parent-key")
    parser.add_argument("--source", default="SGIS")
    parser.add_argument(
        "--source-crs",
        default="EPSG:5179",
        help="GeoJSON 원본 좌표계. SGIS hadmarea 응답 기본값은 EPSG:5179",
    )
    args = parser.parse_args()

    if not args.geojson.exists():
        raise FileNotFoundError(f"GeoJSON 파일을 찾을 수 없습니다: {args.geojson}")

    saved_count = import_areas(
        geojson_path=args.geojson,
        boundary_year=args.boundary_year,
        code_key=args.code_key,
        name_key=args.name_key,
        parent_key=args.parent_key,
        source=args.source,
        source_crs=args.source_crs,
    )
    print(f"전국 행정동 면적 동기화 완료: {saved_count}개")


if __name__ == "__main__":
    main()
