"""VWorld에서 김해시 법정동 경계를 GeoJSON으로 내려받습니다."""

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

import httpx

from .core.config import PROJECT_ROOT, VWORLD_API_DOMAIN, VWORLD_API_KEY


VWORLD_DATA_URL = "https://api.vworld.kr/req/data"
VWORLD_LEGAL_DONG_LAYER = "LT_C_ADEMD_INFO"


def extract_features(payload: dict[str, Any]) -> list[dict[str, Any]]:
    api_response = payload.get("response", {})
    if api_response.get("status") != "OK":
        error = api_response.get("error", {})
        message = error.get("text") or error.get("code") or "알 수 없는 오류"
        raise RuntimeError(f"VWorld 법정동 경계 조회 실패: {message}")

    return (
        api_response
        .get("result", {})
        .get("featureCollection", {})
        .get("features", [])
    )


async def download_legal_boundaries(
    sigungu_code: str,
) -> dict[str, Any]:
    if not VWORLD_API_KEY:
        raise RuntimeError(".env에 VWORLD_API_KEY를 설정해주세요.")

    size = 1000
    page = 1
    features_by_code: dict[str, dict[str, Any]] = {}

    async with httpx.AsyncClient(timeout=60.0) as client:
        while True:
            response = await client.get(
                VWORLD_DATA_URL,
                params={
                    "service": "data",
                    "version": "2.0",
                    "request": "GetFeature",
                    "format": "json",
                    "size": size,
                    "page": page,
                    "geometry": "true",
                    "attribute": "true",
                    "crs": "EPSG:4326",
                    "data": VWORLD_LEGAL_DONG_LAYER,
                    "attrFilter": f"emd_cd:like:{sigungu_code}",
                    "key": VWORLD_API_KEY,
                    "domain": VWORLD_API_DOMAIN,
                },
            )
            response.raise_for_status()
            page_features = extract_features(response.json())

            for feature in page_features:
                properties = feature.get("properties", {})
                region_code = str(properties.get("emd_cd", "")).strip()
                if region_code:
                    features_by_code[region_code] = feature

            print(
                f"VWorld {page}페이지 완료 "
                f"(누적 법정동 {len(features_by_code)}개)",
            )
            if len(page_features) < size:
                break
            page += 1

    return {
        "type": "FeatureCollection",
        "name": f"legal_dong_{sigungu_code}",
        "crs": {
            "type": "name",
            "properties": {"name": "EPSG:4326"},
        },
        "features": list(features_by_code.values()),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sigungu-code", default="48250")
    parser.add_argument("--reference-year", type=int, default=2025)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    output_path = args.output or (
        PROJECT_ROOT
        / "server"
        / "data"
        / "imports"
        / "legal"
        / str(args.reference_year)
        / f"{args.sigungu_code}_legal_dong.geojson"
    )
    geojson = asyncio.run(
        download_legal_boundaries(args.sigungu_code),
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(geojson, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"VWorld 법정동 GeoJSON 저장 완료: {output_path}")
    print(f"저장된 법정동 수: {len(geojson['features'])}")


if __name__ == "__main__":
    main()
