from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Facility


def get_facilities(
    db: Session,
    categories: tuple[str, ...],
) -> list[Facility]:
    statement = (
        select(Facility)
        .where(
            Facility.is_active.is_(True),
            Facility.category.in_(categories),
        )
        .order_by(Facility.category, Facility.name)
    )
    return list(db.scalars(statement).all())


def upsert_facilities(
    db: Session,
    facilities: list[dict[str, object]],
    source: str,
    category: str,
) -> int:
    existing_rows = db.scalars(
        select(Facility).where(
            Facility.source == source,
            Facility.category == category,
        ),
    ).all()
    existing_by_id = {row.source_id: row for row in existing_rows}

    # 이번 동기화에서 사라진 시설은 삭제하지 않고 비활성화합니다.
    for row in existing_rows:
        row.is_active = False

    saved_count = 0
    for item in facilities:
        # 같은 VWorld POI가 병원과 대학처럼 여러 검색 분류에 잡힐 수 있어
        # 저장 키에는 분류를 포함합니다. DB 스키마를 바꾸지 않고도 각
        # 지도 레이어에서 독립적으로 활성·비활성 상태를 관리할 수 있습니다.
        source_id = f"{category}:{item['source_id']}"
        row = existing_by_id.get(source_id)
        if row is None:
            row = Facility(
                source=source,
                source_id=source_id,
                category=category,
            )
            db.add(row)

        row.name = str(item["name"])
        row.latitude = float(item["latitude"])
        row.longitude = float(item["longitude"])
        row.road_address = str(item.get("road_address") or "") or None
        row.parcel_address = str(item.get("parcel_address") or "") or None
        row.phone = str(item.get("phone") or "") or None
        row.is_active = True
        row.fetched_at = item["fetched_at"]  # type: ignore[assignment]
        saved_count += 1

    # 커밋은 동기화 서비스의 업무 단위에서 수행합니다.
    db.flush()
    return saved_count
