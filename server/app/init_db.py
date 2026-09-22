import json
from pathlib import Path

from sqlalchemy import select

from .db import Base, SessionLocal, engine
from .models import Region


PROJECT_ROOT = Path(__file__).resolve().parents[2]
REGION_FILES = (
    ("admin", PROJECT_ROOT / "public" / "data" / "gimhae_hangjeongdong.geojson"),
    ("legal", PROJECT_ROOT / "public" / "data" / "Gimhae_si.geojson"),
)


def get_region_properties(level: str, properties: dict[str, object]) -> tuple[str, str]:
    if level == "admin":
        return (
            str(properties.get("adm_cd2", "")).strip(),
            str(properties.get("adm_nm", "")).strip(),
        )

    return (
        str(properties.get("EMD_CD", "")).strip(),
        str(properties.get("EMD_NM", "")).strip(),
    )


def calculate_area_m2(
    geometry: dict[str, object],
    source_crs: str,
) -> float:
    # pyproj/shapely는 네이티브 DLL을 사용하므로, 스키마만 초기화하는
    # 작업에서는 모듈을 불러오지 않도록 함수 안에 둡니다.
    from pyproj import Transformer
    from shapely.geometry import shape
    from shapely.ops import transform

    source_geometry = shape(geometry)
    transformer = Transformer.from_crs(
        source_crs,
        "EPSG:5186",
        always_xy=True,
    )
    projected_geometry = transform(
        transformer.transform,
        source_geometry,
    )
    return round(float(projected_geometry.area), 2)


def seed_regions() -> int:
    inserted_count = 0

    with SessionLocal() as db:
        for level, geojson_path in REGION_FILES:
            if not geojson_path.exists():
                raise FileNotFoundError(f"GeoJSON 파일을 찾을 수 없습니다: {geojson_path}")

            geojson = json.loads(geojson_path.read_text(encoding="utf-8-sig"))
            source_crs = (
                "EPSG:5186"
                if "5186" in str(
                    geojson.get("crs", {})
                    .get("properties", {})
                    .get("name", ""),
                )
                else "EPSG:4326"
            )

            for feature in geojson.get("features", []):
                properties = feature.get("properties", {})
                code, name = get_region_properties(level, properties)

                if not code or not name:
                    continue

                existing = db.scalar(
                    select(Region).where(
                        Region.level == level,
                        Region.region_code == code,
                    ),
                )
                if existing:
                    existing.region_name = name
                    existing.area_m2 = calculate_area_m2(
                        feature["geometry"],
                        source_crs,
                    )
                    existing.geometry_json = json.dumps(
                        feature["geometry"],
                        ensure_ascii=False,
                    )
                    existing.is_active = True
                    continue

                db.add(
                    Region(
                        level=level,
                        region_code=code,
                        region_name=name,
                        area_m2=calculate_area_m2(
                            feature["geometry"],
                            source_crs,
                        ),
                        geometry_json=json.dumps(
                            feature["geometry"],
                            ensure_ascii=False,
                        ),
                    ),
                )
                inserted_count += 1

        db.commit()

    return inserted_count


def main() -> None:
    Base.metadata.create_all(bind=engine)
    inserted_count = seed_regions()
    print(f"SQLite DB 초기화 완료: {engine.url}")
    print(f"새로 등록된 지역 수: {inserted_count}")


if __name__ == "__main__":
    main()
