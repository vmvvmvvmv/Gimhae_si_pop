from sqlalchemy.orm import Session

from ..repositories.floating_population_repository import (
    get_floating_population,
    get_floating_population_months,
)


def get_availability(db: Session) -> dict[str, object]:
    months = get_floating_population_months(db)
    return {
        "months": months,
        "firstMonth": months[0] if months else None,
        "lastMonth": months[-1] if months else None,
        "meta": {
            "source": "GIMHAE_PUBLIC_DATA_15109694",
            "description": "김해시 행정동별 성·연령별 유동인구 정보데이터",
            "usageNote": "2021년 10월부터 2022년 9월까지의 참고용 데이터",
        },
    }


def get_monthly_population(db: Session, year: int, month: int) -> dict[str, object]:
    stats_ym = f"{year}{month:02d}"
    items = get_floating_population(db, stats_ym)
    return {
        "year": year,
        "month": month,
        "statsYm": stats_ym,
        "count": len(items),
        "items": items,
        "meta": {
            "source": "sqlite",
            "dataAvailable": bool(items),
            "description": "김해시 서비스·주거·직장·방문인구 월별 평균",
            "aggregation": "일별 값을 행정동·월 단위로 산술평균",
            "usageNote": "원 제공기관 안내에 따라 참고용으로 사용",
        },
    }
