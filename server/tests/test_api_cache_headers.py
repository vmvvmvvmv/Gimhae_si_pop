import unittest

from fastapi.testclient import TestClient

from app.main import app


class ApiCacheHeaderTests(unittest.TestCase):
    def test_api_responses_are_not_stored(self):
        with TestClient(app) as client:
            self.assertEqual(client.get("/api/health").headers["cache-control"], "no-store")
            self.assertEqual(client.get("/api/admin/session").headers["cache-control"], "no-store")
