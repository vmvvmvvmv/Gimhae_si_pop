"""GIS 네이티브 의존성을 불러오지 않고 SQLite 테이블을 생성합니다."""

from . import models  # noqa: F401 - 모든 SQLAlchemy 모델을 등록합니다.
from .db import Base, engine
from .services.sync_lock import database_write_lock


@database_write_lock
def main() -> None:
    Base.metadata.create_all(bind=engine)
    print(f"전국 인구 테이블 초기화 완료: {engine.url}")


if __name__ == "__main__":
    main()
