import csv
from io import StringIO
from typing import Any, Literal

from sqlalchemy.orm import Session

from ..repositories.area_repository import get_area_reference
from ..repositories.population_export_repository import (
    get_previous_population,
    list_export_population,
)
from ..repositories.population_repository import shift_month
from .export_limits import (
    MAX_EXPORT_ROWS,
    validate_export_request,
)


ExportScope = Literal["region", "month"]
EXPORT_FIELDS = {
    "population": "총인구(명)",
    "malePopulation": "남성(명)",
    "femalePopulation": "여성(명)",
    "households": "세대 수(세대)",
    "populationPerHousehold": "세대당 인구(명)",
    "areaKm2": "면적(㎢)",
    "populationDensity": "인구밀도(명/㎢)",
    "previousMonthChange": "전월 대비 증감(명)",
    "previousMonthChangeRate": "전월 대비 증감률(%)",
}
AREA_FIELDS = {"areaKm2", "populationDensity"}
CHANGE_FIELDS = {"previousMonthChange", "previousMonthChangeRate"}
MAX_EXPORT_REGIONS = 100


class NoExportData(Exception):
    pass


def prepare_population_export(
    db: Session,
    level: Literal["admin", "legal"],
    scope: ExportScope,
    fields: list[str],
    region_code: str | None,
    from_ym: str | None,
    to_ym: str | None,
    stats_ym: str | None,
    region_codes: list[str] | None = None,
) -> dict[str, Any]:
    selected_fields = list(dict.fromkeys(fields))
    if not selected_fields or any(field not in EXPORT_FIELDS for field in selected_fields):
        raise ValueError("포함할 항목을 하나 이상 선택해주세요.")

    if scope == "region":
        selected_codes = list(dict.fromkeys([
            *(region_codes or []),
            *([region_code] if region_code else []),
        ]))
        if not selected_codes or not from_ym or not to_ym:
            raise ValueError("선택 지역과 시작·종료월을 지정해주세요.")
        if len(selected_codes) > MAX_EXPORT_REGIONS:
            raise ValueError("한 번에 선택할 수 있는 지역 수를 초과했습니다.")
        if any(
            len(code) not in (8, 10) or not code.isascii() or not code.isdigit()
            for code in selected_codes
        ):
            raise ValueError("지역 코드 형식이 올바르지 않습니다.")
        first_month, last_month = from_ym, to_ym
    else:
        if not stats_ym:
            raise ValueError("조회할 월을 선택해주세요.")
        first_month = last_month = stats_ym
        selected_codes = None

    validate_export_request(
        scope,
        first_month if scope == "region" else None,
        last_month if scope == "region" else None,
        stats_ym if scope == "month" else None,
        0,
    )

    records = list_export_population(
        db, level, selected_codes, first_month, last_month, MAX_EXPORT_ROWS + 1,
    )
    if not records:
        raise NoExportData
    validate_export_request(
        scope,
        first_month if scope == "region" else None,
        last_month if scope == "region" else None,
        stats_ym if scope == "month" else None,
        len(records),
    )

    previous_rows = {}
    if CHANGE_FIELDS.intersection(selected_fields):
        previous_rows = get_previous_population(
            db,
            {region.id for region, _ in records},
            {shift_month(row.stats_ym, -1) for _, row in records},
        )

    include_area_fields = bool(AREA_FIELDS.intersection(selected_fields))
    area_references = {}
    if include_area_fields:
        for year in {int(row.stats_ym[:4]) for _, row in records}:
            area_references[year] = get_area_reference(db, level, year)

    columns = ["조회년월", "지역 구분", "지역 코드", "지역명"]
    columns.extend(EXPORT_FIELDS[field] for field in selected_fields)
    if include_area_fields:
        columns.append("면적 기준연도")

    output_rows: list[list[Any]] = []
    for region, row in records:
        area_km2 = None
        resolved_area_km2 = None
        area_year = None
        if include_area_fields:
            area, _, reference_year = area_references[int(row.stats_ym[:4])].resolve(region)
            if area > 0:
                resolved_area_km2 = area
                area_km2 = round(area, 2)
                area_year = reference_year

        previous = previous_rows.get(
            (region.id, shift_month(row.stats_ym, -1)),
        ) if previous_rows else None
        change = row.population - previous.population if previous else None
        values = {
            "population": row.population,
            "malePopulation": row.male_population,
            "femalePopulation": row.female_population,
            "households": row.households,
            "populationPerHousehold": row.population_per_household,
            "areaKm2": area_km2,
            "populationDensity": (
                round(row.population / resolved_area_km2, 2)
                if resolved_area_km2 else None
            ),
            "previousMonthChange": change,
            "previousMonthChangeRate": (
                round(change / previous.population * 100, 2)
                if change is not None and previous and previous.population else None
            ),
        }
        output = [
            f"{row.stats_ym[:4]}-{row.stats_ym[4:]}",
            "행정동" if level == "admin" else "법정동",
            region.region_code,
            region.region_name,
        ]
        output.extend(values[field] for field in selected_fields)
        if include_area_fields:
            output.append(area_year)
        output_rows.append(output)

    return {"columns": columns, "rows": output_rows, "count": len(output_rows)}


def population_export_csv(export: dict[str, Any]) -> bytes:
    output = StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(export["columns"])
    for row in export["rows"]:
        writer.writerow([_safe_csv_cell(value) for value in row])
    return output.getvalue().encode("utf-8-sig")


def _safe_csv_cell(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")):
        return "'" + value
    return value
