from sqlalchemy.orm import Session

from ..facility_quality import (
    deduplicate_facilities,
    deduplicate_nearby_parks,
    deduplicate_nearby_schools,
    display_facility_name,
    is_human_medical_facility,
    is_likely_bridge,
    is_market_or_major_mart,
    is_distinct_school,
    is_passenger_transit,
)
from ..repositories.facility_repository import get_facilities


def list_facilities(db: Session, categories: tuple[str, ...]) -> dict[str, object]:
    rows = [
        {
            "id": row.id,
            "sourceId": row.source_id,
            "category": row.category,
            "name": display_facility_name(row.category, row.name),
            "latitude": row.latitude,
            "longitude": row.longitude,
            "roadAddress": row.road_address,
            "parcelAddress": row.parcel_address,
            "phone": row.phone,
            "source": row.source,
            "fetchedAt": row.fetched_at.isoformat() if row.fetched_at else None,
        }
        for row in get_facilities(db, categories)
        if (row.category != "MARKET" or is_market_or_major_mart(row.name))
        and (row.category != "BRIDGE" or is_likely_bridge(row.name))
        and (row.category != "HOSPITAL" or is_human_medical_facility(row.name))
        and (row.category != "SCHOOL" or is_distinct_school(row.name))
        and (row.category != "TRANSIT" or is_passenger_transit(row.name))
    ]
    hospitals = deduplicate_facilities(
        "HOSPITAL", [row for row in rows if row["category"] == "HOSPITAL"]
    )
    rows = [row for row in rows if row["category"] != "HOSPITAL"] + hospitals
    parks = deduplicate_nearby_parks(
        [row for row in rows if row["category"] == "PARK"]
    )
    rows = [row for row in rows if row["category"] != "PARK"] + parks
    schools = deduplicate_nearby_schools(
        [row for row in rows if row["category"] == "SCHOOL"]
    )
    rows = [row for row in rows if row["category"] != "SCHOOL"] + schools
    rows.sort(key=lambda row: (str(row["category"]), str(row["name"])))
    return {
        "count": len(rows),
        "items": rows,
        "meta": {"source": "sqlite", "categories": list(categories)},
    }
