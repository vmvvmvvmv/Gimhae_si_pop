"""VWorld 개발구역 레이어의 원본 속성 이름을 확인합니다.

인증키는 출력하지 않고, 김해시 범위에서 각 레이어의 앞쪽 세 건에 포함된
속성만 보여줍니다. 실제 사업명 필드를 찾을 때 사용하는 진단 도구입니다.
"""

import asyncio
from typing import Any

import httpx

from .core.config import VWORLD_API_DOMAIN, VWORLD_API_KEY
from .sync_vworld_development_areas import (
    DEFAULT_BBOX,
    DEVELOPMENT_LAYERS,
    VWORLD_WFS_URL,
)


async def inspect_layers() -> None:
    if not VWORLD_API_KEY:
        raise RuntimeError(".env에 VWORLD_API_KEY를 설정해주세요.")

    async with httpx.AsyncClient(timeout=60.0) as client:
        for layer in DEVELOPMENT_LAYERS:
            response = await client.get(
                VWORLD_WFS_URL,
                params={
                    "service": "WFS",
                    "version": "1.1.0",
                    "request": "GetFeature",
                    "typename": layer["source_layer"],
                    "output": "application/json",
                    "srsname": "EPSG:4326",
                    "bbox": DEFAULT_BBOX,
                    "maxfeatures": 3,
                    "key": VWORLD_API_KEY,
                    "domain": VWORLD_API_DOMAIN,
                },
            )
            response.raise_for_status()
            payload: dict[str, Any] = response.json()
            print(f"\n[{layer['category_label']}] {layer['source_layer']}")
            for index, feature in enumerate(payload.get("features", []), start=1):
                properties = feature.get("properties") or {}
                print(f"{index}: {properties}")


def main() -> None:
    asyncio.run(inspect_layers())


if __name__ == "__main__":
    main()
