from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base
from .core.time import utc_now


class Region(Base):
    __tablename__ = "regions"
    __table_args__ = (
        UniqueConstraint("level", "region_code", name="uq_regions_level_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    level: Mapped[str] = mapped_column(String(20), index=True)
    region_code: Mapped[str] = mapped_column(String(20), index=True)
    region_name: Mapped[str] = mapped_column(String(100))
    parent_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    area_m2: Mapped[float | None] = mapped_column(nullable=True)
    geometry_json: Mapped[str | None] = mapped_column(nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)


class PopulationMonthly(Base):
    __tablename__ = "population_monthly"
    __table_args__ = (
        UniqueConstraint(
            "region_id",
            "stats_ym",
            name="uq_population_monthly_region_month",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    region_id: Mapped[int] = mapped_column(
        ForeignKey("regions.id"),
        index=True,
    )
    stats_ym: Mapped[str] = mapped_column(String(6), index=True)
    population: Mapped[int] = mapped_column(default=0)
    male_population: Mapped[int] = mapped_column(default=0)
    female_population: Mapped[int] = mapped_column(default=0)
    households: Mapped[int] = mapped_column(default=0)
    population_per_household: Mapped[float] = mapped_column(default=0)
    source: Mapped[str] = mapped_column(String(100), default="MOIS")
    fetched_at: Mapped[datetime] = mapped_column(default=utc_now)


class NationalPopulationMonthly(Base):
    __tablename__ = "national_population_monthly"
    __table_args__ = (
        UniqueConstraint(
            "stats_ym",
            name="uq_national_population_monthly_stats_ym",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    stats_ym: Mapped[str] = mapped_column(String(6), index=True)
    population: Mapped[int] = mapped_column(default=0)
    source: Mapped[str] = mapped_column(String(100), default="MOIS_API")
    fetched_at: Mapped[datetime] = mapped_column(default=utc_now)


class NationalAreaAnnual(Base):
    __tablename__ = "national_area_annual"
    __table_args__ = (
        UniqueConstraint(
            "year",
            name="uq_national_area_annual_year",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    year: Mapped[int] = mapped_column(index=True)
    area_km2: Mapped[float] = mapped_column()
    source: Mapped[str] = mapped_column(
        String(100),
        default="KOSIS",
    )
    fetched_at: Mapped[datetime] = mapped_column(
        default=utc_now,
    )


class NationalAdministrativeArea(Base):
    """전국 행정동 경계에서 계산한 면적 스냅샷."""

    __tablename__ = "national_administrative_area"
    __table_args__ = (
        UniqueConstraint(
            "boundary_year",
            "region_code",
            name="uq_national_admin_area_year_code",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    boundary_year: Mapped[int] = mapped_column(index=True)
    region_code: Mapped[str] = mapped_column(String(20), index=True)
    region_name: Mapped[str] = mapped_column(String(100))
    parent_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    area_km2: Mapped[float] = mapped_column()
    source: Mapped[str] = mapped_column(String(100), default="SGIS")
    fetched_at: Mapped[datetime] = mapped_column(default=utc_now)


class NationalLegalArea(Base):
    """VWorld 법정읍면동 경계에서 계산한 면적 스냅샷."""

    __tablename__ = "national_legal_area"
    __table_args__ = (
        UniqueConstraint(
            "reference_year",
            "region_code",
            name="uq_national_legal_area_year_code",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    reference_year: Mapped[int] = mapped_column(index=True)
    region_code: Mapped[str] = mapped_column(String(20), index=True)
    region_name: Mapped[str] = mapped_column(String(100))
    parent_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    area_km2: Mapped[float] = mapped_column()
    source: Mapped[str] = mapped_column(String(100), default="VWORLD")
    fetched_at: Mapped[datetime] = mapped_column(default=utc_now)


class NationalAdministrativePopulationMonthly(Base):
    """전국 행정동별 월별 인구 스냅샷."""

    __tablename__ = "national_administrative_population_monthly"
    __table_args__ = (
        UniqueConstraint(
            "region_code",
            "stats_ym",
            name="uq_national_admin_population_code_month",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    region_code: Mapped[str] = mapped_column(String(20), index=True)
    region_name: Mapped[str] = mapped_column(String(100))
    stats_ym: Mapped[str] = mapped_column(String(6), index=True)
    population: Mapped[int] = mapped_column(default=0)
    source: Mapped[str] = mapped_column(String(100), default="MOIS")
    fetched_at: Mapped[datetime] = mapped_column(default=utc_now)


class Facility(Base):
    """지도에 표시할 공공·생활 시설 좌표."""

    __tablename__ = "facilities"
    __table_args__ = (
        UniqueConstraint(
            "source",
            "source_id",
            name="uq_facilities_source_id",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(50), index=True)
    source_id: Mapped[str] = mapped_column(String(100), index=True)
    category: Mapped[str] = mapped_column(String(50), index=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    latitude: Mapped[float] = mapped_column()
    longitude: Mapped[float] = mapped_column()
    road_address: Mapped[str | None] = mapped_column(String(300), nullable=True)
    parcel_address: Mapped[str | None] = mapped_column(String(300), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, index=True)
    fetched_at: Mapped[datetime] = mapped_column(default=utc_now)


class DevelopmentNotice(Base):
    """김해시 UPIS에서 수집한 도시개발 관련 고시."""

    __tablename__ = "development_notices"
    __table_args__ = (
        UniqueConstraint(
            "source",
            "source_id",
            name="uq_development_notices_source_id",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(50), default="GIMHAE_UPIS")
    source_id: Mapped[str] = mapped_column(String(100), index=True)
    notice_number: Mapped[str] = mapped_column(String(100), index=True)
    title: Mapped[str] = mapped_column(String(500), index=True)
    notice_type_code: Mapped[str] = mapped_column(String(20))
    notice_type: Mapped[str] = mapped_column(String(100), index=True)
    notice_date: Mapped[str] = mapped_column(String(10), index=True)
    organization_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    organization_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    stage: Mapped[str] = mapped_column(String(50), index=True)
    stage_label: Mapped[str] = mapped_column(String(100))
    source_url: Mapped[str] = mapped_column(String(500))
    official_link_status: Mapped[str] = mapped_column(
        String(30),
        default="PENDING",
        server_default="PENDING",
        index=True,
    )
    official_link_checked_at: Mapped[datetime | None] = mapped_column(nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, index=True)
    fetched_at: Mapped[datetime] = mapped_column(default=utc_now)


class PopulationAgeMonthly(Base):
    __tablename__ = "population_age_monthly"
    __table_args__ = (
        UniqueConstraint(
            "region_id",
            "stats_ym",
            "age_group",
            name="uq_population_age_region_month_group",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    region_id: Mapped[int] = mapped_column(
        ForeignKey("regions.id"),
        index=True,
    )
    stats_ym: Mapped[str] = mapped_column(String(6), index=True)
    age_group: Mapped[str] = mapped_column(String(20))
    population: Mapped[int] = mapped_column(default=0)
    male_population: Mapped[int] = mapped_column(default=0)
    female_population: Mapped[int] = mapped_column(default=0)
    source: Mapped[str] = mapped_column(String(100), default="MOIS")
    fetched_at: Mapped[datetime] = mapped_column(default=utc_now)


class FloatingPopulationMonthly(Base):
    __tablename__ = "floating_population_monthly"
    __table_args__ = (
        UniqueConstraint(
            "region_id",
            "stats_ym",
            name="uq_floating_population_region_month",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    region_id: Mapped[int] = mapped_column(
        ForeignKey("regions.id"),
        index=True,
    )
    stats_ym: Mapped[str] = mapped_column(String(6), index=True)
    service_population: Mapped[int] = mapped_column(default=0)
    residential_population: Mapped[int] = mapped_column(default=0)
    workplace_population: Mapped[int] = mapped_column(default=0)
    visitor_population: Mapped[int] = mapped_column(default=0)
    source: Mapped[str] = mapped_column(String(100))
    note: Mapped[str | None] = mapped_column(nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(default=utc_now)
