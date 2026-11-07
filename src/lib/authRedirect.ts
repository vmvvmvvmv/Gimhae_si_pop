import { API_BASE_URL } from './apiConfig'

// 로그인 자체와 세션 확인 API는 401이 정상 응답이므로 이동시키지 않습니다.
const AUTH_ENDPOINTS = ['/admin/login', '/admin/session', '/admin/logout']

export function isAuthEndpoint(url: string): boolean {
  return AUTH_ENDPOINTS.some((path) => url.includes(API_BASE_URL + path))
}

// 로그인 뒤 돌아갈 주소는 이 사이트 안의 경로만 허용합니다(열린 리다이렉트 방지).
export function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return '/'
  }
  if (value === '/login' || value.startsWith('/login?')) return '/'
  return value
}

export function loginUrlFor(currentPath: string): string {
  return `/login?next=${encodeURIComponent(currentPath)}`
}

// 로그인이 필요한 기능을 누르면 API가 401을 돌려줍니다. 이때만 로그인 화면으로 보냅니다.
export function installLoginRedirect(): void {
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const response = await originalFetch(input, init)
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (
      response.status === 401 &&
      url.includes(API_BASE_URL) &&
      !isAuthEndpoint(url) &&
      !window.location.pathname.startsWith('/login')
    ) {
      window.location.assign(loginUrlFor(window.location.pathname + window.location.search))
    }
    return response
  }
}
