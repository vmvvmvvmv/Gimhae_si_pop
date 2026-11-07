import unittest

from starlette.responses import Response

from app.services.security_headers import apply_security_headers


class SecurityHeaderTests(unittest.TestCase):
    def test_api_response_contains_baseline_security_headers(self):
        response = Response()
        apply_security_headers(response)

        self.assertEqual(response.headers["x-content-type-options"], "nosniff")
        self.assertEqual(response.headers["x-frame-options"], "DENY")
        self.assertEqual(response.headers["referrer-policy"], "no-referrer")
        self.assertIn("default-src 'self'", response.headers["content-security-policy"])
        self.assertIn("frame-ancestors 'none'", response.headers["content-security-policy"])
        self.assertIn("geolocation=()", response.headers["permissions-policy"])


if __name__ == "__main__":
    unittest.main()
