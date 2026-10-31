from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "server" / "data"
DATABASE_PATH = DATA_DIR / "gimhae_population.db"
DATABASE_URL = f"sqlite:///{DATABASE_PATH.as_posix()}"

DATA_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    DATABASE_URL,
    # FastAPI 요청 처리 스레드가 세션을 사용할 수 있도록 SQLite 제한을 풉니다.
    # 세션을 모든 요청이 공유한다는 뜻은 아닙니다. get_db가 요청마다 만듭니다.
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    # 요청마다 DB 세션을 하나 열고, 끝나면 반드시 닫습니다.
    db = SessionLocal()
    try:
        yield db
    except Exception:
        # 조회 API도 SQLAlchemy의 암시적 트랜잭션을 사용합니다. 향후 쓰기
        # API가 추가되더라도 실패한 요청의 변경이 남지 않도록 명시합니다.
        db.rollback()
        raise
    finally:
        db.close()
