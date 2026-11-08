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


    def test_naver_map_style_scripts_are_allowed_without_opening_other_hosts(self):
        response = Response()
        apply_security_headers(response)
        directives = dict(
            part.strip().split(" ", 1)
            for part in response.headers["content-security-policy"].split(";")
        )
        self.assertIn("*.map.naver.net", directives["script-src"])
        self.assertIn("static.naver.net", directives["style-src"])
        self.assertNotIn("unsafe-inline", directives["script-src"])
        self.assertNotIn("*.naver.com", directives["script-src"])


if __name__ == "__main__":
    unittest.main()
