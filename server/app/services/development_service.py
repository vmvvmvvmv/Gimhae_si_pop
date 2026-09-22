from urllib.parse import urlparse

from sqlalchemy.orm import Session

from ..models import DevelopmentNotice
from ..repositories.development_repository import get_development_notices


OFFICIAL_NOTICE_PATH = "/03360/00023/00029.web"


def verified_official_url(value: str) -> str:
    parsed = urlparse(value)
    if (
        parsed.scheme != "https"
        or parsed.netloc != "www.gimhae.go.kr"
        or parsed.path != OFFICIAL_NOTICE_PATH
        or "not_ancmt_mgt_no=" not in parsed.query
    ):
        return ""
    return value


def serialize_notice(row: DevelopmentNotice) -> dict[str, object]:
    return {
        "id": row.id,
        "sourceId": row.source_id,
        "noticeNumber": row.notice_number,
        "title": row.title,
        "noticeType": row.notice_type,
        "noticeDate": row.notice_date,
        "organizationName": row.organization_name,
        "summary": row.summary,
        "stage": row.stage,
        "stageLabel": row.stage_label,
        "source": row.source,
        # 정확히 대조된 김해시청 고시공고 고유 URL만 외부에 제공합니다.
        "sourceUrl": verified_official_url(row.source_url),
    }


def list_development_notices(
    db: Session, area_name: str | None, limit: int
) -> dict[str, object]:
    rows = get_development_notices(db, area_name=area_name, limit=limit)
    return {
        "count": len(rows),
        "items": [serialize_notice(row) for row in rows],
        "meta": {
            "source": "sqlite",
            "originalSource": "GIMHAE_UPIS",
            "areaName": area_name,
        },
    }
