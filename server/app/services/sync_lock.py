from contextlib import contextmanager
from functools import wraps
from pathlib import Path
from typing import Callable, Iterator, ParamSpec, TypeVar

from ..db import DATA_DIR


class SyncAlreadyRunning(RuntimeError):
    pass


P = ParamSpec("P")
R = TypeVar("R")


def database_write_lock(func: Callable[P, R]) -> Callable[P, R]:
    @wraps(func)
    def wrapped(*args: P.args, **kwargs: P.kwargs) -> R:
        with sync_lock("database"):
            return func(*args, **kwargs)

    return wrapped


@contextmanager
def sync_lock(name: str) -> Iterator[None]:
    """이 호스트에서 같은 이름의 데이터 동기화를 한 번에 하나만 실행합니다."""
    lock_path = Path(DATA_DIR) / f".{name}.sync.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    handle = lock_path.open("a+b")
    try:
        handle.seek(0)
        handle.write(b"0")
        handle.flush()
        _lock(handle)
    except (OSError, PermissionError) as error:
        handle.close()
        raise SyncAlreadyRunning(
            f"{name} 동기화가 이미 실행 중이거나 잠금 파일을 열 수 없습니다.",
        ) from error

    try:
        yield
    finally:
        try:
            _unlock(handle)
        finally:
            handle.close()


def _lock(handle) -> None:
    try:
        import msvcrt

        handle.seek(0)
        msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        return
    except ImportError:
        pass

    import fcntl

    fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)


def _unlock(handle) -> None:
    try:
        import msvcrt

        handle.seek(0)
        msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        return
    except ImportError:
        pass

    import fcntl

    fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
