from __future__ import annotations

import subprocess
import sys
import threading
import time
import os
import sqlite3
from collections.abc import Callable
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator
from uuid import uuid4

from dotenv import dotenv_values

from ..db import DATABASE_PATH
from .export_limits import validate_export_request


SERVER_DIR = Path(__file__).resolve().parents[2]
MAX_RETAINED_JOBS = 20


class SyncAlreadyRunning(RuntimeError):
    pass


def build_population_sync_command(
    level: str,
    from_ym: str,
    to_ym: str,
) -> list[str]:
    validate_export_request("region", from_ym, to_ym, None, 0)
    if level not in {"admin", "legal"}:
        raise ValueError("인구 동기화 구분은 admin 또는 legal이어야 합니다.")
    return [
        sys.executable,
        "-m",
        "app.sync_population_range",
        "--level",
        level,
        "--from-year",
        from_ym[:4],
        "--from-month",
        str(int(from_ym[4:])),
        "--to-year",
        to_ym[:4],
        "--to-month",
        str(int(to_ym[4:])),
        "--delay-seconds",
        "0.8",
    ]


def run_population_sync(command: list[str]) -> tuple[int, str]:
    child_env = os.environ.copy()
    current_key = dotenv_values(SERVER_DIR.parent / ".env").get("MOIS_SERVICE_KEY")
    if current_key:
        child_env["MOIS_SERVICE_KEY"] = current_key.strip()
    completed = subprocess.run(
        command,
        cwd=SERVER_DIR,
        env=child_env,
        capture_output=True,
        text=True,
        check=False,
    )
    output = (completed.stdout + "\n" + completed.stderr).strip()
    return completed.returncode, output[-4_000:]


class SyncJobManager:
    def __init__(
        self,
        runner: Callable[[list[str]], tuple[int, str]] = run_population_sync,
        db_path: Path = DATABASE_PATH,
    ) -> None:
        self._runner = runner
        self._db_path = db_path
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS admin_sync_jobs (
                    id TEXT PRIMARY KEY,
                    level TEXT NOT NULL,
                    from_ym TEXT NOT NULL,
                    to_ym TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    started_at REAL,
                    finished_at REAL,
                    exit_code INTEGER,
                    output TEXT NOT NULL DEFAULT '',
                    owner_pid INTEGER NOT NULL
                )
            """)
            active = db.execute(
                "SELECT id, owner_pid FROM admin_sync_jobs WHERE status IN ('queued', 'running')"
            ).fetchall()
            for job in active:
                if not _process_exists(job["owner_pid"]):
                    db.execute(
                        "UPDATE admin_sync_jobs SET status = 'unknown', finished_at = ? WHERE id = ?",
                        (time.time(), job["id"]),
                    )

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self._db_path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def start_population_sync(
        self,
        level: str,
        from_ym: str,
        to_ym: str,
    ) -> dict[str, object]:
        command = build_population_sync_command(level, from_ym, to_ym)
        job_id = uuid4().hex
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute(
                "SELECT 1 FROM admin_sync_jobs WHERE status IN ('queued', 'running') LIMIT 1"
            ).fetchone():
                raise SyncAlreadyRunning("이미 실행 중인 동기화 작업이 있습니다.")
            db.execute(
                "INSERT INTO admin_sync_jobs "
                "(id, level, from_ym, to_ym, status, created_at, owner_pid) "
                "VALUES (?, ?, ?, ?, 'queued', ?, ?)",
                (job_id, level, from_ym, to_ym, time.time(), os.getpid()),
            )

        thread = threading.Thread(
            target=self._run_job,
            args=(job_id, command),
            name=f"population-sync-{job_id[:8]}",
            daemon=True,
        )
        thread.start()
        return self.get_job(job_id)

    def get_job(self, job_id: str) -> dict[str, object] | None:
        with self._connect() as db:
            row = db.execute("SELECT * FROM admin_sync_jobs WHERE id = ?", (job_id,)).fetchone()
        return _job_dict(row) if row else None

    def list_jobs(self) -> list[dict[str, object]]:
        with self._connect() as db:
            rows = db.execute(
                "SELECT * FROM admin_sync_jobs ORDER BY created_at DESC, id DESC LIMIT ?",
                (MAX_RETAINED_JOBS,),
            ).fetchall()
        return [_job_dict(row) for row in rows]

    def _run_job(self, job_id: str, command: list[str]) -> None:
        with self._connect() as db:
            db.execute(
                "UPDATE admin_sync_jobs SET status = 'running', started_at = ? WHERE id = ?",
                (time.time(), job_id),
            )
        try:
            exit_code, output = self._runner(command)
            final_status = "succeeded" if exit_code == 0 else "failed"
        except Exception as error:
            final_status, exit_code, output = "failed", -1, str(error)[-4_000:]
        with self._connect() as db:
            db.execute(
                "UPDATE admin_sync_jobs SET status = ?, finished_at = ?, exit_code = ?, output = ? "
                "WHERE id = ? AND status = 'running'",
                (final_status, time.time(), exit_code, output[-4_000:], job_id),
            )


def _process_exists(pid: int) -> bool:
    if os.name == "nt":
        import ctypes

        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.OpenProcess.argtypes = [ctypes.c_uint32, ctypes.c_int, ctypes.c_uint32]
        kernel32.OpenProcess.restype = ctypes.c_void_p
        kernel32.GetExitCodeProcess.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_uint32)]
        kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
        handle = kernel32.OpenProcess(0x1000, 0, pid)
        if not handle:
            return ctypes.get_last_error() == 5  # 접근 거부라면 프로세스가 존재할 수 있습니다.
        try:
            exit_code = ctypes.c_uint32()
            return bool(kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code))) and exit_code.value == 259
        finally:
            kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False


def _job_dict(row: sqlite3.Row) -> dict[str, object]:
    return {
        "id": row["id"],
        "level": row["level"],
        "fromYm": row["from_ym"],
        "toYm": row["to_ym"],
        "status": row["status"],
        "startedAt": row["started_at"],
        "finishedAt": row["finished_at"],
        "exitCode": row["exit_code"],
        "output": row["output"],
    }
