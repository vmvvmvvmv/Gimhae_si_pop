import asyncio
import json
from pathlib import Path
from typing import Any, Literal

import httpx

from ..core.config import (
    ADMIN_GEOJSON_PATH,
    AGE_GROUPS,
    LEGAL_GEOJSON_PATH,
    NO_DATA_CODES,
    SUCCESS_CODES,
)
from .mois_client import MoisClient

PopulationLevel = Literal["admin", "legal"]

REGION_CONFIG: dict[PopulationLevel, tuple[Path, str, str]] = {
    "admin": (ADMIN_GEOJSON_PATH, "adm_cd2", "adm_nm"),
    "legal": (LEGAL_GEOJSON_PATH, "EMD_CD", "EMD_NM"),
}


def load_regions(level: PopulationLevel) -> list[dict[str, str]]:
    geojson_path, code_key, name_key = REGION_CONFIG[level]
    if not geojson_path.exists():
        raise FileNotFoundError(
            f"지역 GeoJSON 파일을 찾을 수 없습니다: {geojson_path}",
        )

    geojson = json.loads(
        geojson_path.read_text(encoding="utf-8-sig"),
    )
    regions: list[dict[str, str]] = []

    for feature in geojson.get("features", []):
        properties = feature.get("properties", {})
        code = str(properties.get(code_key, "")).strip()
        name = str(properties.get(name_key, "")).strip()

        if code and name and code not in {region["code"] for region in regions}:
            regions.append({"code": code, "name": name})

    return regions


def load_admin_regions() -> list[dict[str, str]]:
    return load_regions("admin")


def load_legal_regions() -> list[dict[str, str]]:
    return load_regions("legal")


def to_int(value: Any) -> int:
    try:
        return int(float(str(value or "0").replace(",", "").strip()))
    except (TypeError, ValueError):
        return 0


def aggregate_region_rows(
    region: dict[str, str],
    rows: list[dict[str, Any]],
    age_rows: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    age_rows = age_rows or []
    population = sum(to_int(row.get("totNmprCnt")) for row in rows)
    households = sum(to_int(row.get("hhCnt")) for row in rows)
    male_population = sum(to_int(row.get("maleNmprCnt")) for row in rows)
    female_population = sum(to_int(row.get("femlNmprCnt")) for row in rows)
    age_distribution = []

    for label, male_key, female_key in AGE_GROUPS:
        male_count = sum(to_int(row.get(male_key)) for row in age_rows)
        female_count = sum(to_int(row.get(female_key)) for row in age_rows)
        age_distribution.append({
            "ageGroup": label,
            "population": male_count + female_count,
            "malePopulation": male_count,
            "femalePopulation": female_count,
        })

    return {
        "regionCode": region["code"],
        "regionName": region["name"],
        "population": population,
        "households": households,
        "populationPerHousehold": (
            round(population / households, 2) if households else 0
        ),
        "malePopulation": male_population,
        "femalePopulation": female_population,
        "sourceRowCount": len(rows),
        "ageDistribution": age_distribution,
        "ageSourceRowCount": len(age_rows),
    }


def get_stats_month(row: dict[str, Any]) -> str | None:
    value = row.get("statsYm") or row.get("statsYM")
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized if len(normalized) == 6 else None


def group_rows_by_month(
    rows: list[dict[str, Any]],
    default_stats_ym: str,
) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        stats_ym = get_stats_month(row) or default_stats_ym
        grouped.setdefault(stats_ym, []).append(row)
    return grouped


async def get_region_age_population(
    mois_client: MoisClient,
    level: PopulationLevel,
    region_code: str,
    year: int,
    month: int,
) -> dict[str, Any]:
    statistic_month = f"{year}{month:02d}"
    endpoint_key = f"{level}_age"

    async with httpx.AsyncClient(timeout=30.0) as client:
        result = await mois_client.fetch_rows(
            client,
            endpoint_key,
            region_code,
            statistic_month,
            level,
        )

    return {
        "level": level,
        "regionCode": region_code,
        "year": year,
        "month": month,
        "count": len(result.items),
        "items": result.items,
        "meta": {
            "result_code": result.result_code,
            "result_message": result.result_message,
            "item_keys": list(result.items[0].keys()) if result.items else [],
        },
    }


async def get_admin_age_population(
    mois_client: MoisClient,
    administrative_code: str,
    year: int,
    month: int,
) -> dict[str, Any]:
    return await get_region_age_population(
        mois_client,
        "admin",
        administrative_code,
        year,
        month,
    )


async def get_region_population(
    mois_client: MoisClient,
    level: PopulationLevel,
    year: int,
    month: int,
) -> dict[str, Any]:
    regions = load_regions(level)
    statistic_month = f"{year}{month:02d}"
    semaphore = asyncio.Semaphore(8)

    async def fetch_one(region: dict[str, str]) -> dict[str, Any]:
        async with semaphore:
            try:
                population_result = await mois_client.fetch_rows(
                    client,
                    level,
                    region["code"],
                    statistic_month,
                    level,
                )
                age_result = await mois_client.fetch_rows(
                    client,
                    f"{level}_age",
                    region["code"],
                    statistic_month,
                    level,
                )
            except (httpx.HTTPError, ValueError) as error:
                return {"region": region, "error": str(error)}

        if population_result.result_code in NO_DATA_CODES:
            return {
                "region": region,
                "items": [],
                "age_items": [],
                "no_data": True,
            }

        if population_result.result_code not in SUCCESS_CODES:
            return {
                "region": region,
                "error": (
                    population_result.result_message
                    or population_result.result_code
                ),
            }

        if (
            age_result.result_code not in SUCCESS_CODES
            and age_result.result_code not in NO_DATA_CODES
        ):
            return {
                "region": region,
                "error": age_result.result_message or age_result.result_code,
            }

        return {
            "region": region,
            "items": population_result.items,
            "age_items": (
                []
                if age_result.result_code in NO_DATA_CODES
                else age_result.items
            ),
        }

    async with httpx.AsyncClient(timeout=30.0) as client:
        results = await asyncio.gather(
            *(fetch_one(region) for region in regions),
        )

    items: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []
    no_data: list[str] = []

    for result in results:
        region = result["region"]
        if "error" in result:
            failed.append({
                "regionCode": region["code"],
                "regionName": region["name"],
                "error": result["error"],
            })
        elif result.get("no_data"):
            no_data.append(region["code"])
            items.append(aggregate_region_rows(region, []))
        else:
            items.append(aggregate_region_rows(
                region,
                result.get("items", []),
                result.get("age_items", []),
            ))

    return {
        "level": level,
        "year": year,
        "month": month,
        "count": len(items),
        "items": items,
        "meta": {
            "requestedRegionCount": len(regions),
            "failedRegionCount": len(failed),
            "noDataRegionCount": len(no_data),
            "ageDataIncluded": True,
            "failedRegions": failed,
        },
    }


async def get_admin_region_population(
    mois_client: MoisClient,
    year: int,
    month: int,
) -> dict[str, Any]:
    return await get_region_population(mois_client, "admin", year, month)


async def get_legal_region_population(
    mois_client: MoisClient,
    year: int,
    month: int,
) -> dict[str, Any]:
    return await get_region_population(mois_client, "legal", year, month)


async def get_region_population_range(
    mois_client: MoisClient,
    level: PopulationLevel,
    from_year: int,
    from_month: int,
    to_year: int,
    to_month: int,
) -> dict[str, dict[str, Any]]:
    """최대 3개월 API 응답을 월별 결과로 분리합니다."""
    regions = load_regions(level)
    from_ym = f"{from_year}{from_month:02d}"
    to_ym = f"{to_year}{to_month:02d}"
    semaphore = asyncio.Semaphore(4)

    async with httpx.AsyncClient(timeout=45.0) as client:
        async def fetch_rows_with_retry(
            endpoint_key: str,
            region_code: str,
        ):
            last_error = "알 수 없는 API 오류"
            for attempt in range(3):
                try:
                    result = await mois_client.fetch_rows(
                        client,
                        endpoint_key,
                        region_code,
                        from_ym,
                        level,
                        to_ym,
                    )
                    if (
                        result.result_code in SUCCESS_CODES
                        or result.result_code in NO_DATA_CODES
                    ):
                        return result
                    last_error = (
                        result.result_message or result.result_code
                    )
                except (httpx.HTTPError, ValueError) as error:
                    last_error = str(error)

                if attempt < 2:
                    await asyncio.sleep(1.5 * (attempt + 1))

            raise RuntimeError(last_error)

        async def fetch_one(region: dict[str, str]) -> dict[str, Any]:
            async with semaphore:
                try:
                    population_result = await fetch_rows_with_retry(
                        level,
                        region["code"],
                    )
                    age_result = await fetch_rows_with_retry(
                        f"{level}_age",
                        region["code"],
                    )
                except (httpx.HTTPError, RuntimeError, ValueError) as error:
                    return {"region": region, "error": str(error)}

            if population_result.result_code in NO_DATA_CODES:
                return {"region": region, "items": [], "age_items": []}
            if population_result.result_code not in SUCCESS_CODES:
                return {
                    "region": region,
                    "error": population_result.result_message
                    or population_result.result_code,
                }
            if (
                age_result.result_code not in SUCCESS_CODES
                and age_result.result_code not in NO_DATA_CODES
            ):
                return {
                    "region": region,
                    "error": age_result.result_message
                    or age_result.result_code,
                }

            return {
                "region": region,
                "items": population_result.items,
                "age_items": (
                    []
                    if age_result.result_code in NO_DATA_CODES
                    else age_result.items
                ),
            }

        results = await asyncio.gather(
            *(fetch_one(region) for region in regions),
        )

    by_month: dict[str, dict[str, Any]] = {}
    failed_by_month: dict[str, list[dict[str, str]]] = {}
    for result in results:
        if "error" in result:
            failed_by_month.setdefault(from_ym, []).append({
                "regionCode": result["region"]["code"],
                "regionName": result["region"]["name"],
                "error": result["error"],
            })
            continue

        region = result["region"]
        summary_by_month = group_rows_by_month(
            result.get("items", []),
            from_ym,
        )
        age_by_month = group_rows_by_month(
            result.get("age_items", []),
            from_ym,
        )
        for stats_ym, rows in summary_by_month.items():
            month_result = by_month.setdefault(
                stats_ym,
                {
                    "level": level,
                    "year": int(stats_ym[:4]),
                    "month": int(stats_ym[4:]),
                    "items": [],
                    "meta": {
                        "failedRegionCount": 0,
                        "failedRegions": [],
                    },
                },
            )
            month_result["items"].append(aggregate_region_rows(
                region,
                rows,
                age_by_month.get(stats_ym, []),
            ))

    for result in by_month.values():
        result["count"] = len(result["items"])

    for stats_ym, failures in failed_by_month.items():
        month_result = by_month.setdefault(
            stats_ym,
            {
                "level": level,
                "year": int(stats_ym[:4]),
                "month": int(stats_ym[4:]),
                "items": [],
                "count": 0,
                "meta": {},
            },
        )
        month_result["meta"]["failedRegionCount"] = len(failures)
        month_result["meta"]["failedRegions"] = failures

    return by_month
