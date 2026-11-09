from starlette.responses import Response


# style-src의 'unsafe-inline'은 네이버 지도 SDK가 요소에 인라인 style 속성을 넣기 때문에 남겨 둡니다.
# 제거하려면 지도 키로 실제 지도를 띄워 보고, 콘솔에 style 위반이 없는지 확인한 뒤 바꿔야 합니다.
# 네이버 지도 SDK는 스타일 정보를 *.map.naver.net과 nrbe.pstatic.net에서 스크립트로 받고, 오류 기록을 nelo로 보냅니다. 호스트에 https://를 적지 않으면
# HTTPS 페이지에서는 HTTPS로만 허용되고, 로컬 http에서도 같은 정책으로 시험할 수 있습니다.
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "base-uri 'self'; "
    "object-src 'none'; "
    "frame-ancestors 'none'; "
    "form-action 'self'; "
    "script-src 'self' oapi.map.naver.com *.map.naver.net nrbe.pstatic.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net oapi.map.naver.com static.naver.net; "
    "font-src 'self' https://cdn.jsdelivr.net data:; "
    "img-src 'self' data: blob: https: *.naver.net; "
    "connect-src 'self' oapi.map.naver.com *.naver.com *.map.naver.net kr-col-ext.nelo.navercorp.com; "
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
    # 네이버 지도가 도메인을 인증하려면 Referer가 필요합니다. 외부로는 경로 없이 출처만 보냅니다.
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Content-Security-Policy", CONTENT_SECURITY_POLICY)
    response.headers.setdefault("Permissions-Policy", PERMISSIONS_POLICY)
    return response
