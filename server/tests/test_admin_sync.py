import time
import unittest
import sqlite3
import os
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

from app.services.admin_sync_service import (
    SERVER_DIR,
    SyncAlreadyRunning,
    SyncJobManager,
    _process_exists,
    build_population_sync_command,
    run_population_sync,
)


class AdminSyncTests(unittest.TestCase):
    def test_process_check_does_not_interrupt_running_process(self):
        self.assertTrue(_process_exists(os.getpid()))
        self.assertFalse(_process_exists(2147483647))

    def test_child_uses_current_root_env_key(self):
        with patch("app.services.admin_sync_service.dotenv_values", return_value={"MOIS_SERVICE_KEY": "fresh-key"}), \
             patch("app.services.admin_sync_service.subprocess.run", return_value=SimpleNamespace(returncode=0, stdout="ok", stderr="")) as run, \
             patch.dict("os.environ", {"MOIS_SERVICE_KEY": "stale-key"}):
            run_population_sync(["python", "-m", "app.sync_population_range"])
        self.assertEqual(run.call_args.kwargs["env"]["MOIS_SERVICE_KEY"], "fresh-key")

    def test_sync_runs_from_server_module_root(self):
        self.assertEqual(SERVER_DIR.name, "server")

    def test_builds_fixed_population_command_without_shell(self):
        command = build_population_sync_command("admin", "202607", "202608")
        self.assertEqual(command[1:], [
            "-m", "app.sync_population_range",
            "--level", "admin",
            "--from-year", "2026",
            "--from-month", "7",
            "--to-year", "2026",
            "--to-month", "8",
            "--delay-seconds", "0.8",
        ])

    def test_rejects_invalid_or_overlong_sync_range(self):
        with self.assertRaises(ValueError):
            build_population_sync_command("admin", "202608", "202607")
        with self.assertRaises(ValueError):
            build_population_sync_command("admin", "202401", "202601")

    def test_only_one_job_can_run_at_a_time(self):
        started = False

        def runner(command):
            nonlocal started
            started = True
            time.sleep(0.05)
            return 0, "saved"

        with TemporaryDirectory(dir=Path.cwd()) as directory:
            manager = SyncJobManager(runner=runner, db_path=Path(directory) / "jobs.db")
            manager.start_population_sync("admin", "202608", "202608")
            while not started:
                time.sleep(0.005)
            with self.assertRaises(SyncAlreadyRunning):
                manager.start_population_sync("legal", "202608", "202608")
            while manager.list_jobs()[0]["status"] == "running":
                time.sleep(0.005)

    def test_completed_job_survives_manager_restart(self):
        with TemporaryDirectory(dir=Path.cwd()) as directory:
            path = Path(directory) / "jobs.db"
            manager = SyncJobManager(runner=lambda _: (0, "19개 저장"), db_path=path)
            job = manager.start_population_sync("admin", "202608", "202608")
            while manager.get_job(job["id"])["status"] in {"queued", "running"}:
                time.sleep(0.005)
            restarted = SyncJobManager(db_path=path)
            self.assertEqual(restarted.get_job(job["id"])["status"], "succeeded")
            self.assertIn("19개 저장", restarted.list_jobs()[0]["output"])

    def test_second_manager_cannot_start_while_first_job_runs(self):
        with TemporaryDirectory(dir=Path.cwd()) as directory:
            path = Path(directory) / "jobs.db"
            manager = SyncJobManager(runner=lambda _: (0, "ok"), db_path=path)
            with closing(sqlite3.connect(path)) as db, db:
                db.execute(
                    "INSERT INTO admin_sync_jobs "
                    "(id, level, from_ym, to_ym, status, created_at, owner_pid) "
                    "VALUES ('active', 'admin', '202608', '202608', 'running', 1, ?)",
                    (os.getpid(),),
                )
            second = SyncJobManager(db_path=path)
            with self.assertRaises(SyncAlreadyRunning):
                second.start_population_sync("legal", "202608", "202608")

    def test_unfinished_job_after_restart_is_marked_unknown(self):
        with TemporaryDirectory(dir=Path.cwd()) as directory:
            path = Path(directory) / "jobs.db"
            SyncJobManager(db_path=path)
            with closing(sqlite3.connect(path)) as db, db:
                db.execute(
                    "INSERT INTO admin_sync_jobs "
                    "(id, level, from_ym, to_ym, status, created_at, owner_pid) "
                    "VALUES ('stale', 'admin', '202608', '202608', 'running', 1, 2147483647)",
                )
            restarted = SyncJobManager(db_path=path)
            self.assertEqual(restarted.get_job("stale")["status"], "unknown")


if __name__ == "__main__":
    unittest.main()
