from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import NationalAdministrativeArea, NationalLegalArea, Region


@dataclass(frozen=True)
class AreaReference:
    source: str
    reference_year: int | None
    area_by_code: dict[str, float]
    area_by_name: dict[str, float]

    def resolve(self, region: Region) -> tuple[float, str, int | None]:
        short_name = region.region_name.split()[-1]
        external_area = (
            self.area_by_code.get(region.region_code)
            or self.area_by_name.get(region.region_name)
            or self.area_by_name.get(short_name)
        )
        if external_area is not None:
            return external_area, self.source, self.reference_year

        local_area = region.area_m2 / 1_000_000 if region.area_m2 else 0
        return local_area, "LOCAL_GEOJSON", None


def _get_admin_reference(db: Session, year: int) -> AreaReference:
    reference_year = db.scalar(
        select(func.max(NationalAdministrativeArea.boundary_year)).where(
            NationalAdministrativeArea.boundary_year <= year,
        ),
    )
    if reference_year is None:
        reference_year = db.scalar(
            select(func.max(NationalAdministrativeArea.boundary_year)),
        )

    rows = []
    if reference_year is not None:
        rows = db.scalars(
            select(NationalAdministrativeArea).where(
                NationalAdministrativeArea.boundary_year == reference_year,
                NationalAdministrativeArea.region_name.like("%김해시 %"),
            ),
        ).all()

    return AreaReference(
        source="SGIS" if rows else "LOCAL_GEOJSON",
        reference_year=reference_year if rows else None,
        area_by_code={row.region_code: row.area_km2 for row in rows},
        area_by_name={
            key: row.area_km2
            for row in rows
            for key in (row.region_name, row.region_name.split()[-1])
        },
    )


def _get_legal_reference(db: Session, year: int) -> AreaReference:
    reference_year = db.scalar(
        select(func.max(NationalLegalArea.reference_year)).where(
            NationalLegalArea.reference_year <= year,
        ),
    )
    if reference_year is None:
        reference_year = db.scalar(
            select(func.max(NationalLegalArea.reference_year)),
        )

    rows = []
    if reference_year is not None:
        rows = db.scalars(
            select(NationalLegalArea).where(
                NationalLegalArea.reference_year == reference_year,
                NationalLegalArea.region_code.like("48250%"),
            ),
        ).all()

    return AreaReference(
        source="VWORLD" if rows else "LOCAL_GEOJSON",
        reference_year=reference_year if rows else None,
        area_by_code={row.region_code: row.area_km2 for row in rows},
        area_by_name={
            key: row.area_km2
            for row in rows
            for key in (row.region_name, row.region_name.split()[-1])
        },
    )


def get_area_reference(
    db: Session,
    level: str,
    year: int,
) -> AreaReference:
    if level == "admin":
        return _get_admin_reference(db, year)
    if level == "legal":
        return _get_legal_reference(db, year)
    return AreaReference("LOCAL_GEOJSON", None, {}, {})
