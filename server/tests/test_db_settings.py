import unittest

from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool
from pathlib import Path
import tempfile

from app import db as db_module


class DatabaseSettingsTests(unittest.TestCase):
    def test_connections_use_wal_and_busy_timeout(self):
        with tempfile.TemporaryDirectory() as tmp:
            engine = create_engine(f"sqlite:///{Path(tmp, 'x.db').as_posix()}")
            event.listen(engine, "connect", db_module._configure_sqlite)
            try:
                with engine.connect() as connection:
                    self.assertEqual(connection.exec_driver_sql("PRAGMA journal_mode").scalar(), "wal")
                    self.assertEqual(connection.exec_driver_sql("PRAGMA busy_timeout").scalar(), 10000)
            finally:
                engine.dispose()


if __name__ == "__main__":
    unittest.main()
