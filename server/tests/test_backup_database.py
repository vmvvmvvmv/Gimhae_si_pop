import sqlite3
import io
import tempfile
import unittest
from contextlib import closing
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from app.backup_database import (
    backup_daily_once,
    backup_database,
    main,
    seconds_until_next_daily_backup,
    verify_restore,
)


class BackupDatabaseTests(unittest.TestCase):
    def test_backup_uses_sqlite_backup_api(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
            root = Path(directory)
            source = root / "source.db"
            target = root / "backup.db"
            db = sqlite3.connect(source)
            try:
                db.execute("create table sample (value text)")
                db.execute("insert into sample values ('ok')")
                db.commit()
            finally:
                db.close()

            with patch("app.backup_database.DATABASE_PATH", source):
                result = backup_database(target)

            db = sqlite3.connect(result)
            try:
                self.assertEqual(
                    db.execute("select value from sample").fetchone()[0],
                    "ok",
                )
            finally:
                db.close()

    def test_backup_can_be_restored_and_checked(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
            root = Path(directory)
            source = root / "source.db"
            target = root / "backup.db"
            with closing(sqlite3.connect(source)) as db:
                with db:
                    db.execute("create table sample (value text)")
                    db.execute("insert into sample values ('restorable')")

            with patch("app.backup_database.DATABASE_PATH", source):
                self.assertEqual(backup_database(target), target)
            verify_restore(target)
            with closing(sqlite3.connect(target)) as db:
                self.assertEqual(
                    db.execute("select value from sample").fetchone(),
                    ("restorable",),
                )

    def test_invalid_source_never_publishes_a_backup(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
            root = Path(directory)
            source = root / "source.db"
            target = root / "backup.db"
            source.write_bytes(b"not a sqlite database")
            with patch("app.backup_database.DATABASE_PATH", source):
                with self.assertRaises(sqlite3.DatabaseError):
                    backup_database(target)
            self.assertFalse(target.exists())

    def test_restore_check_rejects_corrupt_backup(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
            corrupt = Path(directory) / "bad.db"
            corrupt.write_bytes(b"not a sqlite database")
            with self.assertRaises(sqlite3.DatabaseError):
                verify_restore(corrupt)

    def test_daily_backup_retains_two_newest_without_touching_manual_files(self):
        kst = timezone(timedelta(hours=9))
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
            root = Path(directory)
            source = root / "source.db"
            backup_dir = root / "backups"
            backup_dir.mkdir()
            with closing(sqlite3.connect(source)) as db:
                with db:
                    db.execute("create table sample (value integer)")
                    db.execute("insert into sample values (42)")
            old = backup_dir / "gimhae_population_daily_20261027_030000.db"
            recent = backup_dir / "gimhae_population_daily_20261028_030000.db"
            manual = backup_dir / "gimhae_population.before_sync_20261027.db"
            for path in (old, recent, manual):
                path.write_bytes(b"old backup")

            with patch("app.backup_database.DATABASE_PATH", source), \
                 patch("app.backup_database.DATA_DIR", root):
                result = backup_daily_once(
                    keep=2,
                    now=datetime(2026, 10, 30, 3, 0, tzinfo=kst),
                )

            self.assertEqual(result.name, "gimhae_population_daily_20261030_030000.db")
            self.assertFalse(old.exists())
            self.assertTrue(recent.exists())
            self.assertTrue(manual.exists())
            verify_restore(result)

    def test_daily_wait_uses_korean_three_am(self):
        kst = timezone(timedelta(hours=9))
        self.assertEqual(
            seconds_until_next_daily_backup(
                datetime(2026, 10, 30, 2, 59, tzinfo=kst),
            ),
            60,
        )
        self.assertEqual(
            seconds_until_next_daily_backup(
                datetime(2026, 10, 30, 3, 0, tzinfo=kst),
            ),
            86400,
        )

    def test_once_daily_command_creates_backup_and_exits(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
            root = Path(directory)
            source = root / "source.db"
            with closing(sqlite3.connect(source)) as db:
                with db:
                    db.execute("create table sample (value integer)")
                    db.execute("insert into sample values (42)")
            with patch("app.backup_database.DATABASE_PATH", source), \
                 patch("app.backup_database.DATA_DIR", root), \
                 patch("sys.argv", ["backup_database", "--once-daily", "--keep", "2"]), \
                 redirect_stdout(io.StringIO()):
                main()
            backups = list((root / "backups").glob("gimhae_population_daily_*.db"))
            self.assertEqual(len(backups), 1)
            verify_restore(backups[0])

    def _sample_db(self, path, value):
        with closing(sqlite3.connect(path)) as db:
            with db:
                db.execute("create table sample (value text)")
                db.execute("insert into sample values (?)", (value,))

    def test_daily_backup_includes_accounts_and_audit_with_own_retention(self):
        kst = timezone(timedelta(hours=9))
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
            root = Path(directory)
            source = root / "source.db"
            self._sample_db(source, "population")
            self._sample_db(root / "admin_accounts.db", "accounts")
            self._sample_db(root / "admin_audit.db", "audit")
            backup_dir = root / "backups"
            backup_dir.mkdir()
            old_accounts = backup_dir / "admin_accounts_daily_20261027_030000.db"
            old_population = backup_dir / "gimhae_population_daily_20261027_030000.db"
            for path in (old_accounts, old_population):
                path.write_bytes(b"old backup")

            with patch("app.backup_database.DATABASE_PATH", source), \
                 patch("app.backup_database.DATA_DIR", root):
                backup_daily_once(keep=1, now=datetime(2026, 10, 30, 3, 0, tzinfo=kst))

            self.assertFalse(old_accounts.exists())
            self.assertFalse(old_population.exists())
            for prefix, value in (
                ("gimhae_population", "population"),
                ("admin_accounts", "accounts"),
                ("admin_audit", "audit"),
            ):
                backup = backup_dir / f"{prefix}_daily_20261030_030000.db"
                verify_restore(backup)
                with closing(sqlite3.connect(backup)) as db:
                    self.assertEqual(db.execute("select value from sample").fetchone(), (value,))

    def test_population_backup_survives_a_broken_accounts_file(self):
        kst = timezone(timedelta(hours=9))
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
            root = Path(directory)
            source = root / "source.db"
            self._sample_db(source, "population")
            (root / "admin_accounts.db").write_bytes(b"not a sqlite database")

            with patch("app.backup_database.DATABASE_PATH", source), \
                 patch("app.backup_database.DATA_DIR", root):
                with self.assertRaises(sqlite3.DatabaseError):
                    backup_daily_once(now=datetime(2026, 10, 30, 3, 0, tzinfo=kst))

            backups = root / "backups"
            self.assertTrue((backups / "gimhae_population_daily_20261030_030000.db").exists())
            self.assertFalse((backups / "admin_accounts_daily_20261030_030000.db").exists())

if __name__ == "__main__":
    unittest.main()
