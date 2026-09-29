"""개발 고시 저장 업무 단위를 조정합니다."""

from sqlalchemy.orm import Session

from ..models import DevelopmentNotice
from ..repositories.development_repository import (
    deactivate_development_notices_in_range,
    get_development_notices_for_official_matching,
    update_development_notice_urls,
    upsert_development_notices,
)


def replace_development_notices(
    db: Session,
    *,
    from_date: str,
    to_date: str,
    notices: list[dict[str, object]],
) -> int:
    """동기화 범위 비활성화와 신규 저장을 하나의 트랜잭션으로 실행합니다."""
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
