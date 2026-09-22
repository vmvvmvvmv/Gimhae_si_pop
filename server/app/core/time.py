from datetime import UTC, datetime


def utc_now() -> datetime:
    """현재 시각을 UTC 시간대 정보가 포함된 datetime으로 반환합니다."""
    return datetime.now(UTC)
