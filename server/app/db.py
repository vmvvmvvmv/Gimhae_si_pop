from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, event
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


@event.listens_for(engine, "connect")
def _configure_sqlite(dbapi_connection, _record) -> None:
    # WAL이면 읽기와 쓰기가 서로 덜 막히고, 백업 컨테이너가 같은 파일을 읽어도 안전합니다.
    # busy_timeout은 잠금이 풀릴 때까지 최대 10초 기다리게 합니다.
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=10000")
    cursor.close()


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
