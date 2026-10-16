import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import main
from app.main import app


class FrontendCacheHeaderTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        dist = Path(self.tmp.name)
        (dist / "assets").mkdir()
        (dist / "index.html").write_text("<html></html>", encoding="utf-8")
        (dist / "assets" / "index-abc123.js").write_text("console.log(1)", encoding="utf-8")
        self.patcher = patch.object(main, "FRONTEND_DIR", dist)
        self.patcher.start()
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.patcher.stop()
        self.tmp.cleanup()

    def test_index_is_revalidated_on_every_load(self):
        # 배포 뒤 브라우저가 예전 index.html과 예전 번들을 계속 쓰지 않게 합니다.
        for path in ("/", "/index.html", "/dashboard"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200, path)
            self.assertEqual(response.headers["cache-control"], "no-cache", path)

    def test_hashed_assets_are_cached_long_term(self):
        response = self.client.get("/assets/index-abc123.js")
        self.assertEqual(response.status_code, 200)
        self.assertIn("immutable", response.headers["cache-control"])


if __name__ == "__main__":
    unittest.main()
