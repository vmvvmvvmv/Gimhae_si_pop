"""SQLite 백업을 만들고 복구 검증과 운영용 정기 백업을 실행합니다."""

import argparse
import os
import re
import sqlite3
import sys
import time
from contextlib import closing
from datetime import datetime, time as clock_time, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from .db import DATA_DIR, DATABASE_PATH


KST = timezone(timedelta(hours=9))
# 인구 DB와 함께 매일 백업할 파일입니다. 로그인 세션과 시도 횟수는 잃어도 되므로 넣지 않습니다.
EXTRA_DAILY_DATABASES = ("admin_accounts", "admin_audit")


def verify_restore(backup_path: Path) -> None:
    """백업을 임시 DB에 복구하고 무결성을 검사합니다."""
    with TemporaryDirectory(prefix=".gimhae-restore-", dir=DATA_DIR) as directory:
        restored = Path(directory) / "restored.db"
        with closing(sqlite3.connect(backup_path.resolve().as_uri() + "?mode=ro", uri=True)) as source:
            with closing(sqlite3.connect(restored)) as destination:
                source.backup(destination)
                destination.commit()
                result = destination.execute("PRAGMA integrity_check").fetchone()
                if result != ("ok",):
                    raise sqlite3.DatabaseError(f"복구 DB 무결성 검사 실패: {result}")


def backup_database(destination: Path | None = None, source_path: Path | None = None) -> Path:
    source_path = source_path or DATABASE_PATH
    if not source_path.exists():
        raise FileNotFoundError(f"DB를 찾을 수 없습니다: {source_path}")

    target = destination or (
        DATA_DIR
        / "backups"
        / f"gimhae_population_{datetime.now(KST):%Y%m%d_%H%M%S}.db"
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        raise FileExistsError(f"백업 대상이 이미 존재합니다: {target}")

    # 임시 백업의 실제 복구 검증이 끝난 뒤에만 최종 경로에 저장합니다.
    with TemporaryDirectory(prefix=".gimhae-backup-", dir=target.parent) as directory:
        candidate = Path(directory) / "candidate.db"
        with closing(sqlite3.connect(source_path.resolve().as_uri() + "?mode=ro", uri=True)) as source:
            with closing(sqlite3.connect(candidate)) as backup:
                source.backup(backup)
                backup.commit()
        verify_restore(candidate)
        # 두 방식 모두 기존 백업을 덮어쓰지 않고 원자적으로 저장합니다.
        if os.name == "nt":
            candidate.rename(target)
        else:
            os.link(candidate, target)
    return target


def backup_daily_once(keep: int = 14, now: datetime | None = None) -> Path:
    if keep < 1:
        raise ValueError("백업 보관 개수는 1 이상이어야 합니다.")
    current = (now or datetime.now(KST)).astimezone(KST)
    # 인구 DB를 먼저 끝냅니다. 뒤의 파일이 실패해도 인구 DB 백업은 남고, 호출자가 재시도합니다.
    result = _backup_daily_file(DATABASE_PATH, "gimhae_population", current, keep)
    for name in EXTRA_DAILY_DATABASES:
        source = DATA_DIR / f"{name}.db"
        if source.exists():  # 앱을 한 번도 실행하지 않았으면 아직 파일이 없습니다.
            _backup_daily_file(source, name, current, keep)
    return result


def _backup_daily_file(source: Path, prefix: str, current: datetime, keep: int) -> Path:
    directory = DATA_DIR / "backups"
    result = backup_database(directory / f"{prefix}_daily_{current:%Y%m%d_%H%M%S}.db", source)
    daily_name = re.compile(re.escape(prefix) + r"_daily_\d{8}_\d{6}\.db")
    daily_files = sorted(
        (path for path in directory.iterdir()
         if path.is_file() and daily_name.fullmatch(path.name)),
        key=lambda path: path.name,
        reverse=True,
    )
    for old_backup in daily_files[keep:]:
        old_backup.unlink()
    return result


def seconds_until_next_daily_backup(now: datetime | None = None) -> int:
    current = (now or datetime.now(KST)).astimezone(KST)
    next_run = datetime.combine(current.date(), clock_time(3), tzinfo=KST)
    if next_run <= current:
        next_run += timedelta(days=1)
    return max(1, int((next_run - current).total_seconds()))


def run_daily_backups(keep: int = 14) -> None:
    """시작할 때와 매일 03:00 KST에 백업하고, 실패하면 한 시간 뒤 재시도합니다."""
    while True:
        try:
            result = backup_daily_once(keep=keep)
        except Exception as error:
            print(f"DB 백업 실패: {error}", file=sys.stderr, flush=True)
            time.sleep(3600)
        else:
            print(f"DB 백업·복구 검증 완료: {result}", flush=True)
            time.sleep(seconds_until_next_daily_backup())


def main() -> None:
    parser = argparse.ArgumentParser(description="SQLite DB 백업 및 복구 검증")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--daily", action="store_true", help="시작 시 및 매일 03:00 KST 백업")
    mode.add_argument("--once-daily", action="store_true", help="정기 백업을 한 번 실행하고 종료")
    mode.add_argument("--verify", type=Path, metavar="BACKUP", help="백업을 임시 DB로 복구해 검증")
    parser.add_argument("--output", type=Path, help="단발 백업 저장 경로")
    parser.add_argument("--keep", type=int, default=14, help="정기 백업 보관 개수 (기본 14)")
    args = parser.parse_args()
    if args.output and (args.daily or args.once_daily or args.verify):
        parser.error("--output은 정기 백업 또는 --verify와 함께 사용할 수 없습니다.")
    if args.verify:
        verify_restore(args.verify)
        print(f"복구 검증 완료: {args.verify}")
    elif args.daily:
        run_daily_backups(keep=args.keep)
    elif args.once_daily:
        result = backup_daily_once(keep=args.keep)
        print(f"DB 백업·복구 검증 완료: {result}")
    else:
        result = backup_database(args.output)
        print(f"백업·복구 검증 완료: {result}")


if __name__ == "__main__":
    main()
