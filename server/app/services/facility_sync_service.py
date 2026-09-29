"""시설 동기화의 저장 규칙을 제공합니다."""

from sqlalchemy.orm import Session

from ..repositories.facility_repository import upsert_facilities


def save_facility_snapshot(
    db: Session,
    facilities: list[dict[str, object]],
    *,
    source: str,
    category: str,
) -> int:
    """한 시설 분류의 활성 상태와 최신 자료를 함께 저장합니다."""
    return upsert_facilities(db, facilities, source, category)
