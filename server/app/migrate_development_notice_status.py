"""기존 SQLite DB에 공식 고시 확인 상태 열을 추가합니다."""

from sqlalchemy import inspect, text

from .db import engine


OFFICIAL_URL_PATTERNS = (
    "%not_ancmt_mgt_no=%",
    "%/web/gs/gv/gvGosiDet.jsp?seq=%",
    "%minwon.gyeongnam.go.kr/citynet/jsp/sap/SAPGosiBizProcess.do?command=searchDetail%",
)


def migrate() -> None:
    columns = {
        column["name"]
        for column in inspect(engine).get_columns("development_notices")
    }
    with engine.begin() as connection:
        if "official_link_status" not in columns:
            connection.execute(text(
                "ALTER TABLE development_notices "
                "ADD COLUMN official_link_status VARCHAR(30) "
                "NOT NULL DEFAULT 'PENDING'"
            ))
        if "official_link_checked_at" not in columns:
            connection.execute(text(
                "ALTER TABLE development_notices "
                "ADD COLUMN official_link_checked_at DATETIME"
            ))
        connection.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_development_notices_official_link_status "
            "ON development_notices (official_link_status)"
        ))
        conditions = " OR ".join(
            f"source_url LIKE :pattern_{index}"
            for index in range(len(OFFICIAL_URL_PATTERNS))
        )
        parameters = {
            f"pattern_{index}": pattern
            for index, pattern in enumerate(OFFICIAL_URL_PATTERNS)
        }
        connection.execute(
            text(
                "UPDATE development_notices "
                "SET official_link_status = 'VERIFIED' "
                f"WHERE {conditions}"
            ),
            parameters,
        )


def main() -> None:
    migrate()
    print("개발 고시 공식 원문 상태 열 준비 완료")


if __name__ == "__main__":
    main()
