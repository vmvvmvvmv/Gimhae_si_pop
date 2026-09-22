"""SGIS에서 전국 행정동 경계를 받아 하나의 GeoJSON으로 저장합니다."""

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

import httpx

from .core.config import (
    PROJECT_ROOT,
    SGIS_ACCESS_TOKEN,
    SGIS_CONSUMER_KEY,
    SGIS_CONSUMER_SECRET,
)


SGIS_BOUNDARY_URL = (
    "https://sgisapi.mods.go.kr/OpenAPI3/boundary/hadmarea.geojson"
)
SGIS_AUTH_URL = (
    "https://sgisapi.mods.go.kr/OpenAPI3/auth/authentication.json"
)

# SGIS 행정구역 코드 기준의 17개 시도 코드입니다.
SIDO_CODES = (
    "11", "21", "22", "23", "24", "25", "26", "29",
    "31", "32", "33", "34", "35", "36", "37", "38", "39",
)


def get_default_output_path(year: int) -> Path:
    """연도별 SGIS 원본 GeoJSON의 기본 저장 위치를 반환합니다."""
    return (
        PROJECT_ROOT
        / "server"
        / "data"
        / "imports"
        / "national_admin"
        / str(year)
        / "admin_dong.geojson"
    )


async def fetch_sido_features(
    client: httpx.AsyncClient,
    access_token: str,
    year: int,
    sido_code: str,
) -> list[dict[str, Any]]:
    response = await client.get(
        SGIS_BOUNDARY_URL,
        params={
            "accessToken": access_token,
            "year": year,
            "adm_cd": sido_code,
            "low_search": 2,
        },
    )
    response.raise_for_status()
    payload = response.json()

    if payload.get("errCd") not in (0, "0"):
        raise RuntimeError(
            f"시도 코드 {sido_code} 조회 실패: "
            f"{payload.get('errMsg', payload.get('errCd'))}",
        )

    return payload.get("features", [])


async def get_access_token(client: httpx.AsyncClient) -> str:
    """서비스 ID와 보안 Key로 실행 시점의 SGIS 토큰을 발급받습니다."""
    if SGIS_CONSUMER_KEY and SGIS_CONSUMER_SECRET:
        response = await client.get(
            SGIS_AUTH_URL,
            params={
                "consumer_key": SGIS_CONSUMER_KEY,
                "consumer_secret": SGIS_CONSUMER_SECRET,
            },
        )
        response.raise_for_status()
        payload = response.json()

        if payload.get("errCd") not in (0, "0"):
            raise RuntimeError(
                "SGIS 토큰 발급 실패: "
                f"{payload.get('errMsg', payload.get('errCd'))}",
            )

        access_token = str(
            payload.get("result", {}).get("accessToken", ""),
        ).strip()
        if not access_token:
            raise RuntimeError("SGIS 인증 응답에 accessToken이 없습니다.")

        print("SGIS 액세스 토큰 발급 완료")
        return access_token

    if SGIS_ACCESS_TOKEN:
        return SGIS_ACCESS_TOKEN

    raise RuntimeError(
        ".env에 SGIS_CONSUMER_KEY와 SGIS_CONSUMER_SECRET을 "
        "설정해주세요.",
    )


async def download_national_admin_areas(
    year: int,
    delay_seconds: float,
) -> dict[str, Any]:
    features: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=60.0) as client:
        access_token = await get_access_token(client)
        for index, sido_code in enumerate(SIDO_CODES):
            features.extend(
                await fetch_sido_features(
                    client,
                    access_token,
                    year,
                    sido_code,
                ),
            )
            print(
                f"시도 {index + 1}/{len(SIDO_CODES)} 완료 "
                f"(누적 행정동 {len(features)}개)",
            )
            if delay_seconds and index < len(SIDO_CODES) - 1:
                await asyncio.sleep(delay_seconds)

    return {
        "type": "FeatureCollection",
        "name": f"national_administrative_dong_{year}",
        "crs": {
            "type": "name",
            "properties": {
                "name": "EPSG:5179",
            },
        },
        "features": features,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=2025)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--delay-seconds", type=float, default=0.3)
    args = parser.parse_args()

    geojson = asyncio.run(
        download_national_admin_areas(args.year, args.delay_seconds),
    )
    output_path = args.output or get_default_output_path(args.year)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(geojson, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"전국 행정동 GeoJSON 저장 완료: {output_path}")
    print(f"저장된 feature 수: {len(geojson['features'])}")


if __name__ == "__main__":
    main()
