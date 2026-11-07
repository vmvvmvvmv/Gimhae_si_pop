import unittest

from app.services.export_limits import (
    ExportLimitError,
    ExportRateLimiter,
    validate_export_request,
)


class ExportLimitValidationTests(unittest.TestCase):
    def test_accepts_one_month_export_within_row_limit(self):
        self.assertIsNone(
            validate_export_request(
                "month", None, None, "202608", 19,
            ),
        )

    def test_rejects_invalid_region_range(self):
        with self.assertRaises(ExportLimitError) as context:
            validate_export_request("region", "202608", "202607", None, 19)
        self.assertEqual(context.exception.status_code, 400)

    def test_rejects_region_range_over_24_months(self):
        with self.assertRaises(ExportLimitError) as context:
            validate_export_request("region", "202401", "202601", None, 19)
        self.assertEqual(context.exception.status_code, 400)

    def test_rejects_export_over_5000_rows(self):
        with self.assertRaises(ExportLimitError) as context:
            validate_export_request("month", None, None, "202608", 5001)
        self.assertEqual(context.exception.status_code, 413)


class ExportRateLimiterTests(unittest.TestCase):
    def test_allows_five_requests_and_rejects_sixth_in_window(self):
        limiter = ExportRateLimiter()
        self.assertTrue(all(limiter.allow("client", now=float(index)) for index in range(5)))
        self.assertFalse(limiter.allow("client", now=5.0))

    def test_allows_request_after_window_expires(self):
        limiter = ExportRateLimiter()
        for index in range(5):
            self.assertTrue(limiter.allow("client", now=float(index)))
        self.assertTrue(limiter.allow("client", now=60.0))

    def test_tracks_clients_separately(self):
        limiter = ExportRateLimiter()
        for index in range(5):
            self.assertTrue(limiter.allow("client-a", now=float(index)))
        self.assertTrue(limiter.allow("client-b", now=5.0))

    def test_evicts_old_client_keys_when_capacity_is_reached(self):
        limiter = ExportRateLimiter(max_clients=2)
        for index in range(5):
            self.assertTrue(limiter.allow("client-a", now=float(index)))
        self.assertTrue(limiter.allow("client-b", now=5.0))
        self.assertTrue(limiter.allow("client-c", now=6.0))
        self.assertTrue(limiter.allow("client-a", now=7.0))


if __name__ == "__main__":
    unittest.main()
