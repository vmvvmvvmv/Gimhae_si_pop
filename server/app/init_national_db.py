"""Create SQLite tables without loading the native GIS dependencies."""

from . import models  # noqa: F401 - register every SQLAlchemy model
from .db import Base, engine


def main() -> None:
    Base.metadata.create_all(bind=engine)
    print(f"전국 인구 테이블 초기화 완료: {engine.url}")


if __name__ == "__main__":
    main()
