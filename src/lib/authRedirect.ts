import { API_BASE_URL } from './apiConfig'

// 로그인 자체와 세션 확인 API는 401이 정상 응답이므로 로그인 창을 띄우지 않습니다.
const AUTH_ENDPOINTS = ['/admin/login', '/admin/session', '/admin/logout']
export const LOGIN_REQUIRED_EVENT = 'gimhae:login-required'
export const SESSION_CHANGED_EVENT = 'gimhae:session-changed'

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

// 로그인 창 요청은 한 번에 하나만 엽니다. 동시에 여러 요청이 401을 받아도 창은 하나입니다.
let pendingLogin: Promise<boolean> | null = null
let resolvePendingLogin: ((loggedIn: boolean) => void) | null = null

// 사용자가 창을 닫은 직후에는 다시 띄우지 않습니다. React Query가 실패한 조회를 1초 뒤에 자동으로
// 다시 요청하는데, 그때마다 창이 다시 뜨는 것을 막기 위함입니다.
export const LOGIN_PROMPT_COOLDOWN_MS = 3000
let suppressedUntil = 0

export function requestLogin(userInitiated = false): Promise<boolean> {
  // 사용자가 직접 로그인 버튼을 누른 경우에는 대기 시간과 상관없이 엽니다.
  if (!userInitiated && Date.now() < suppressedUntil) return Promise.resolve(false)
  if (!pendingLogin) {
    pendingLogin = new Promise<boolean>((resolve) => {
      resolvePendingLogin = resolve
      window.dispatchEvent(new CustomEvent(LOGIN_REQUIRED_EVENT))
    })
  }
  return pendingLogin
}

// 로그인 창이 성공하면 true, 닫으면 false로 끝냅니다.
export function finishLogin(loggedIn: boolean): void {
  if (!loggedIn) suppressedUntil = Date.now() + LOGIN_PROMPT_COOLDOWN_MS
  else window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT))
  resolvePendingLogin?.(loggedIn)
  resolvePendingLogin = null
  pendingLogin = null
}

type FetchFn = typeof window.fetch

// 401을 받으면 로그인 창을 띄우고, 로그인에 성공하면 막혔던 요청을 한 번 더 보냅니다.
export function createLoginRetryFetch(
  baseFetch: FetchFn,
  askLogin: () => Promise<boolean>,
  currentPath: () => string,
): FetchFn {
  return async (input, init) => {
    const response = await baseFetch(input, init)
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (
      response.status !== 401 ||
      !url.includes(API_BASE_URL) ||
      isAuthEndpoint(url) ||
      currentPath().startsWith('/login')
    ) {
      return response
    }
    const loggedIn = await askLogin()
    return loggedIn ? baseFetch(input, init) : response
  }
}

export function installLoginRetry(): void {
  const originalFetch = window.fetch.bind(window)
  window.fetch = createLoginRetryFetch(
    originalFetch,
    () => requestLogin(),
    () => window.location.pathname,
  )
}
