from urllib.parse import parse_qs, urlparse

from sqlalchemy.orm import Session

from ..models import DevelopmentNotice
from ..official_notice_status import (
    PENDING,
    STATUS_LABELS,
    STATUS_MESSAGES,
    VALID_STATUSES,
    VERIFIED,
)
from ..repositories.development_repository import get_development_notices


OFFICIAL_NOTICE_PATH = "/03360/00023/00029.web"
EUM_NOTICE_PATH = "/web/gs/gv/gvGosiDet.jsp"
GYEONGNAM_NOTICE_PATH = "/citynet/jsp/sap/SAPGosiBizProcess.do"


def verified_official_url(value: str) -> str:
    # DB에 URL이 들어 있어도 화면에 내보내기 전에 HTTPS·공식 도메인·
    # 상세 페이지 식별자를 다시 확인합니다. 목록/임의 외부 주소는 빈 값입니다.
    parsed = urlparse(value)
    if parsed.scheme != "https":
        return ""
    if (
        parsed.netloc == "www.gimhae.go.kr"
        and parsed.path == OFFICIAL_NOTICE_PATH
        and "not_ancmt_mgt_no=" in parsed.query
    ):
        return value
    if (
        parsed.netloc in {"www.eum.go.kr", "eum.go.kr"}
        and parsed.path == EUM_NOTICE_PATH
        and parse_qs(parsed.query).get("seq", [""])[0].isdigit()
    ):
        return value
    query = parse_qs(parsed.query)
    if (
        parsed.netloc == "minwon.gyeongnam.go.kr"
        and parsed.path == GYEONGNAM_NOTICE_PATH
        and query.get("command", [""])[0] == "searchDetail"
        and query.get("flag", [""])[0] == "gosiGL"
        and query.get("gosiGbn", [""])[0] == "N"
        and query.get("sno", [""])[0].isdigit()
        and query.get("svp", [""])[0] == "Y"
    ):
        return value
    return ""


def serialize_notice(row: DevelopmentNotice) -> dict[str, object]:
    official_url = verified_official_url(row.source_url)
    stored_status = (
        row.official_link_status
        if row.official_link_status in VALID_STATUSES
        else PENDING
    )
    status = (
        # 저장된 상태가 '확인됨'이어도 URL 규칙을 통과하지 못하면
        # 화면에 공식 원문으로 표시하지 않습니다.
        VERIFIED
        if official_url
        else PENDING if stored_status == VERIFIED else stored_status
    )
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
        # 번호·날짜·제목·발행기관을 대조한 공식 고유 URL만 제공합니다.
        "sourceUrl": official_url,
        "officialLinkStatus": status,
        "officialLinkStatusLabel": STATUS_LABELS.get(status, STATUS_LABELS[PENDING]),
        "officialLinkMessage": STATUS_MESSAGES.get(status, STATUS_MESSAGES[PENDING]),
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
