"""개발 고시 저장 업무 단위를 조정합니다."""

from sqlalchemy.orm import Session

from ..models import DevelopmentNotice
from ..official_notice_status import VALID_STATUSES
from ..repositories.development_repository import (
    deactivate_development_notices_in_range,
    get_development_notices_for_official_matching,
    update_development_notice_urls,
    update_development_notice_statuses,
    upsert_development_notices,
)


def replace_development_notices(
    db: Session,
    *,
    from_date: str,
    to_date: str,
    notices: list[dict[str, object]],
) -> int:
    """기존 고시를 비활성화하고 새 자료를 저장합니다.

    호출자가 연 DB 트랜잭션 안에서 두 작업을 실행해야 중간 실패 시
    비활성화까지 함께 취소됩니다. 이 함수 자체는 commit하지 않습니다.
    """
    deactivate_development_notices_in_range(db, from_date, to_date)
    return upsert_development_notices(db, notices)


def load_official_link_targets(
    db: Session,
    *,
    official_url_markers: tuple[str, ...],
    limit: int | None,
    notice_number: str | None,
    organization_name: str | None,
    refresh: bool,
) -> list[DevelopmentNotice]:
    return get_development_notices_for_official_matching(
        db,
        official_url_markers=official_url_markers,
        limit=limit,
        notice_number=notice_number,
        organization_name=organization_name,
        refresh=refresh,
    )


def save_official_notice_urls(
    db: Session,
    urls_by_source_id: dict[str, str],
) -> int:
    return update_development_notice_urls(db, urls_by_source_id)


def save_official_notice_statuses(
    db: Session,
    statuses_by_source_id: dict[str, str],
) -> int:
    """공식 사이트 대조 결과만 저장하고 후보 URL은 저장하지 않습니다."""
    invalid_statuses = set(statuses_by_source_id.values()) - VALID_STATUSES
    if invalid_statuses:
        raise ValueError(
            f"지원하지 않는 공식 원문 상태입니다: {sorted(invalid_statuses)}"
        )
    return update_development_notice_statuses(db, statuses_by_source_id)
