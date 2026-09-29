"""김해시 UPIS의 도시개발 관련 고시를 SQLite에 저장합니다."""

import argparse
import asyncio
import json
import math
from datetime import date
from pathlib import Path
from typing import Any

import httpx

from .core.time import utc_now
from .db import Base, SessionLocal, engine
from .services.development_sync_service import replace_development_notices


UPIS_BASE_URL = "https://gimhae.go.kr/upis"
UPIS_LIST_URL = f"{UPIS_BASE_URL}/search_tn_ntfc.do"
UPIS_COUNT_URL = f"{UPIS_BASE_URL}/count_tn_ntfc.do"
UPIS_NOTICE_URL = f"{UPIS_BASE_URL}/notification.do"
PAGE_SIZE = 10
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEVELOPMENT_AREAS_PATH = (
    PROJECT_ROOT / "public" / "data" / "gimhae_development_areas.geojson"
)

NOTICE_TYPES = {
    "CMG0001": "결정",
    "CMG0002": "지적승인",
    "CMG0003": "실시계획인가",
    "CMG0004": "결정+지적승인",
    "CMG0005": "결정+실시계획인가",
    "CMG0006": "결정+지적승인+실시계획인가",
    "CMG0007": "지적승인+실시계획인가",
}

ORGANIZATIONS = {
    "5350000": "김해시",
    "6480000": "경상남도",
    "1613000": "국토교통부",
    "1613281": "부산지방국토관리청",
    "9010000": "경상남도교육청",
    "9090000": "경남김해교육청",
}

DEVELOPMENT_KEYWORDS = (
    "도시개발",
    "산업단지",
    "농공단지",
    "물류단지",
    "지구단위계획",
    "택지개발",
    "개발사업",
    "사업지구",
    "공공주택",
    "보금자리",
    "주거환경개선",
    "재개발",
    "재건축",
)


def classify_stage(title: str, notice_type: str) -> tuple[str, str]:
    if any(keyword in title for keyword in ("해제", "취소")):
        return "CANCELLED", "지정 해제·취소"
    if any(keyword in title for keyword in ("준공", "완료")):
        return "COMPLETED", "준공·완료"
    if "실시계획" in title or "실시계획인가" in notice_type:
        return "IMPLEMENTATION", "실시계획 인가"
    if "승인" in title:
        return "DESIGNATED", "계획 승인·변경"
    if any(keyword in title for keyword in ("구역지정", "지정", "결정")):
        return "DESIGNATED", "구역 지정·결정"
    return "NOTICE", "관련 고시"


def is_development_notice(item: dict[str, Any]) -> bool:
    # 요약에는 담당 부서명인 '도시개발과'가 자주 들어가므로 제목만
    # 판정합니다. 그렇지 않으면 일반 주차장·도로 고시까지 섞입니다.
    title = str(item.get("con2") or "")
    return any(keyword in title for keyword in DEVELOPMENT_KEYWORDS)


def load_referenced_notice_ids() -> set[str]:
    """VWorld 개발구역이 직접 참조하는 고시 식별자를 읽습니다."""
    if not DEVELOPMENT_AREAS_PATH.exists():
        return set()

    payload = json.loads(DEVELOPMENT_AREAS_PATH.read_text(encoding="utf-8"))
    return {
        str(feature.get("properties", {}).get("noticeSourceId") or "").strip()
        for feature in payload.get("features", [])
        if str(
            feature.get("properties", {}).get("noticeSourceId") or ""
        ).strip()
    }


def normalize_notice(item: dict[str, Any]) -> dict[str, object]:
    title = str(item.get("con2") or "").strip()
    notice_type_code = str(item.get("con3") or "").strip()
    notice_type = NOTICE_TYPES.get(notice_type_code, "기타 고시")
    stage, stage_label = classify_stage(title, notice_type)
    organization_code = str(item.get("con5") or "").strip()
    notice_number = str(item.get("con1") or "").strip()
    source_id = str(item.get("con7") or "").strip()
    return {
        "source_id": source_id,
        "notice_number": notice_number,
        "title": title,
        "notice_type_code": notice_type_code,
        "notice_type": notice_type,
        "notice_date": str(item.get("con4") or "").strip(),
        "organization_code": organization_code,
        "organization_name": ORGANIZATIONS.get(organization_code, "김해시"),
        "summary": str(item.get("con6") or "").strip(),
        "stage": stage,
        "stage_label": stage_label,
        # search_notice.do는 원시 JSON API이며 사용자용 페이지가 아닙니다.
        # UPIS는 외부에서 상세 고시를 직접 여는 URL을 제공하지 않습니다.
        "source_url": UPIS_NOTICE_URL,
        "fetched_at": utc_now(),
    }


async def post_json(
    client: httpx.AsyncClient,
    url: str,
    data: dict[str, object],
) -> list[dict[str, Any]]:
    response = await client.post(url, data=data)
    response.raise_for_status()
    try:
        payload = response.json()
    except ValueError as error:
        preview = " ".join(response.text[:300].split())
        raise RuntimeError(f"UPIS 응답이 JSON 형식이 아닙니다: {preview}") from error
    if not isinstance(payload, list):
        raise RuntimeError("UPIS 응답 형식이 예상과 다릅니다.")
    return payload


async def download_notices(
    from_date: str,
    to_date: str,
    delay_seconds: float,
    max_pages: int | None,
    referenced_notice_ids: set[str],
) -> list[dict[str, object]]:
    common_data: dict[str, object] = {
        "idn": "4",
        "v1": "",
        "v2": "",
        "v3": from_date,
        "v4": to_date,
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; GimhaePopulationMap/1.0)",
        "Referer": UPIS_NOTICE_URL,
        "X-Requested-With": "XMLHttpRequest",
    }

    async with httpx.AsyncClient(
        timeout=60.0,
        headers=headers,
        follow_redirects=True,
    ) as client:
        count_payload = await post_json(client, UPIS_COUNT_URL, common_data)
        total_count = int(count_payload[0].get("con1", 0)) if count_payload else 0
        total_pages = math.ceil(total_count / PAGE_SIZE)
        if max_pages is not None:
            total_pages = min(total_pages, max_pages)

        print(f"UPIS 조회 대상: {total_count}건, {total_pages}페이지")
        notices_by_id: dict[str, dict[str, object]] = {}
        for page in range(1, total_pages + 1):
            rows = await post_json(
                client,
                UPIS_LIST_URL,
                {**common_data, "pageIndex": page},
            )
            for row in rows:
                source_id = str(row.get("con7") or "").strip()
                if (
                    not is_development_notice(row)
                    and source_id not in referenced_notice_ids
                ):
                    continue
                normalized = normalize_notice(row)
                source_id = str(normalized["source_id"])
                if source_id:
                    notices_by_id[source_id] = normalized

            print(
                f"UPIS {page}/{total_pages}페이지 완료 "
                f"(개발 관련 {len(notices_by_id)}건)"
            )
            if page < total_pages and delay_seconds > 0:
                await asyncio.sleep(delay_seconds)

    return list(notices_by_id.values())


def main() -> None:
    current_year = date.today().year
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-date", default=f"{current_year - 3}0101")
    parser.add_argument("--to-date", default=date.today().strftime("%Y%m%d"))
    parser.add_argument("--delay-seconds", type=float, default=0.25)
    parser.add_argument("--max-pages", type=int)
    args = parser.parse_args()

    for value, label in ((args.from_date, "시작일"), (args.to_date, "종료일")):
        if len(value) != 8 or not value.isdigit():
            raise ValueError(f"{label}은 YYYYMMDD 형식이어야 합니다.")

    referenced_notice_ids = load_referenced_notice_ids()
    print(
        "VWorld 개발구역 참조 고시 식별자: "
        f"{len(referenced_notice_ids)}개"
    )
    notices = asyncio.run(
        download_notices(
            args.from_date,
            args.to_date,
            args.delay_seconds,
            args.max_pages,
            referenced_notice_ids,
        )
    )
    Base.metadata.create_all(bind=engine)
    with SessionLocal.begin() as db:
        # 같은 기간을 다시 동기화할 때 필터에서 제외된 기존 행은 삭제하지
        # 않고 비활성화합니다. 원본 이력은 남기면서 화면에는 노출하지 않습니다.
        saved_count = replace_development_notices(
            db,
            from_date=args.from_date,
            to_date=args.to_date,
            notices=notices,
        )

    print(f"김해시 UPIS 개발 관련 고시 동기화 완료: {saved_count}건")


if __name__ == "__main__":
    main()
