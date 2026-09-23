from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..models import DevelopmentNotice


def deactivate_development_notices_in_range(
    db: Session,
    from_date: str,
    to_date: str,
) -> None:
    rows = db.scalars(
        select(DevelopmentNotice).where(
            DevelopmentNotice.source == "GIMHAE_UPIS",
            DevelopmentNotice.notice_date >= from_date,
            DevelopmentNotice.notice_date <= to_date,
        ),
    ).all()
    for row in rows:
        row.is_active = False
    db.commit()


def upsert_development_notices(
    db: Session,
    notices: list[dict[str, object]],
) -> int:
    source_ids = [str(item["source_id"]) for item in notices]
    existing_rows = db.scalars(
        select(DevelopmentNotice).where(
            DevelopmentNotice.source == "GIMHAE_UPIS",
            DevelopmentNotice.source_id.in_(source_ids),
        ),
    ).all()
    existing_by_id = {row.source_id: row for row in existing_rows}

    for item in notices:
        source_id = str(item["source_id"])
        row = existing_by_id.get(source_id)
        if row is None:
            row = DevelopmentNotice(
                source="GIMHAE_UPIS",
                source_id=source_id,
            )
            db.add(row)

        row.notice_number = str(item["notice_number"])
        row.title = str(item["title"])
        row.notice_type_code = str(item["notice_type_code"])
        row.notice_type = str(item["notice_type"])
        row.notice_date = str(item["notice_date"])
        row.organization_code = str(item.get("organization_code") or "") or None
        row.organization_name = str(item.get("organization_name") or "") or None
        row.summary = str(item.get("summary") or "") or None
        row.stage = str(item["stage"])
        row.stage_label = str(item["stage_label"])
        incoming_source_url = str(item["source_url"])
        # 정확히 검증한 김해시청·토지이음 고유 URL을 이미 찾은 경우,
        # 이후 UPIS 재동기화가 일반 목록 주소로 되돌리지 않도록 보존합니다.
        if (
            not row.source_url
            or not any(
                marker in row.source_url
                for marker in (
                    "not_ancmt_mgt_no=",
                    "/web/gs/gv/gvGosiDet.jsp?seq=",
                )
            )
        ):
            row.source_url = incoming_source_url
        row.is_active = True
        row.fetched_at = item["fetched_at"]  # type: ignore[assignment]

    db.commit()
    return len(notices)


def get_development_notices(
    db: Session,
    *,
    area_name: str | None = None,
    limit: int = 100,
) -> list[DevelopmentNotice]:
    statement = select(DevelopmentNotice).where(
        DevelopmentNotice.is_active.is_(True),
    )
    if area_name:
        compact_name = area_name.strip()
        statement = statement.where(
            or_(
                DevelopmentNotice.title.contains(compact_name),
                DevelopmentNotice.summary.contains(compact_name),
            )
        )

    statement = statement.order_by(
        DevelopmentNotice.notice_date.desc(),
        DevelopmentNotice.id.desc(),
    ).limit(limit)
    return list(db.scalars(statement).all())
