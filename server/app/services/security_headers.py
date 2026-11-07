from starlette.responses import Response


CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "base-uri 'self'; "
    "object-src 'none'; "
    "frame-ancestors 'none'; "
    "form-action 'self'; "
    "script-src 'self' https://oapi.map.naver.com; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://oapi.map.naver.com; "
    "font-src 'self' https://cdn.jsdelivr.net data:; "
    "img-src 'self' data: blob: https:; "
    "connect-src 'self' https://oapi.map.naver.com https://*.naver.com; "
    "frame-src https://*.naver.com; "
    "media-src 'self' blob:; "
    "worker-src 'self' blob:"
)
PERMISSIONS_POLICY = (
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
)


def apply_security_headers(response: Response) -> Response:
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Content-Security-Policy", CONTENT_SECURITY_POLICY)
    response.headers.setdefault("Permissions-Policy", PERMISSIONS_POLICY)
    return response
