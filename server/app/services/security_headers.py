from starlette.responses import Response


# style-src의 'unsafe-inline'은 네이버 지도 SDK가 요소에 인라인 style 속성을 넣기 때문에 남겨 둡니다.
# 제거하려면 지도 키로 실제 지도를 띄워 보고, 콘솔에 style 위반이 없는지 확인한 뒤 바꿔야 합니다.
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
