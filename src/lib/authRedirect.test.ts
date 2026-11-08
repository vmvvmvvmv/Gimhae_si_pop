import { describe, expect, it, vi } from 'vitest'
import { createLoginRetryFetch, isAuthEndpoint, loginUrlFor, safeNextPath } from './authRedirect'

describe('safeNextPath', () => {
  it('keeps same-site paths', () => {
    expect(safeNextPath('/admin')).toBe('/admin')
    expect(safeNextPath('/?region=1')).toBe('/?region=1')
  })

  it('rejects external and protocol-relative targets', () => {
    expect(safeNextPath('https://evil.example')).toBe('/')
    expect(safeNextPath('//evil.example')).toBe('/')
    expect(safeNextPath('/\\evil.example')).toBe('/')
    expect(safeNextPath(null)).toBe('/')
  })

  it('does not loop back to the login page', () => {
    expect(safeNextPath('/login')).toBe('/')
  })
})

describe('login helpers', () => {
  it('encodes the page to return to', () => {
    expect(loginUrlFor('/?a=1&b=2')).toBe('/login?next=%2F%3Fa%3D1%26b%3D2')
  })

  it('treats login and session endpoints as non-prompting', () => {
    expect(isAuthEndpoint('/api/admin/session')).toBe(true)
    expect(isAuthEndpoint('/api/admin/login')).toBe(true)
    expect(isAuthEndpoint('/api/population/export.csv')).toBe(false)
  })
})

describe('createLoginRetryFetch', () => {
  const unauthorized = () => new Response('{}', { status: 401 })
  const ok = () => new Response('{"items":[]}', { status: 200 })

  it('asks for login on a 401 and retries the same request once it succeeds', async () => {
    const base = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(ok())
    const askLogin = vi.fn().mockResolvedValue(true)
    const wrapped = createLoginRetryFetch(base, askLogin, () => '/')

    const response = await wrapped('/api/population/export.csv?x=1', { method: 'GET' })

    expect(response.status).toBe(200)
    expect(askLogin).toHaveBeenCalledTimes(1)
    expect(base).toHaveBeenCalledTimes(2)
    expect(base.mock.calls[1][0]).toBe('/api/population/export.csv?x=1')
  })

  it('returns the original 401 when the user closes the login window', async () => {
    const base = vi.fn().mockResolvedValue(unauthorized())
    const wrapped = createLoginRetryFetch(base, vi.fn().mockResolvedValue(false), () => '/')

    const response = await wrapped('/api/facilities/comparison')

    expect(response.status).toBe(401)
    expect(base).toHaveBeenCalledTimes(1)
  })

  it('does not open the login window for login or session checks', async () => {
    const base = vi.fn().mockResolvedValue(unauthorized())
    const askLogin = vi.fn()
    const wrapped = createLoginRetryFetch(base, askLogin, () => '/')

    await wrapped('/api/admin/session')
    await wrapped('/api/admin/login', { method: 'POST' })

    expect(askLogin).not.toHaveBeenCalled()
  })

  it('does not open the login window on the login page itself', async () => {
    const base = vi.fn().mockResolvedValue(unauthorized())
    const askLogin = vi.fn()
    const wrapped = createLoginRetryFetch(base, askLogin, () => '/login')

    await wrapped('/api/population/export.csv')

    expect(askLogin).not.toHaveBeenCalled()
  })

  it('leaves successful responses alone', async () => {
    const base = vi.fn().mockResolvedValue(ok())
    const askLogin = vi.fn()
    const wrapped = createLoginRetryFetch(base, askLogin, () => '/')

    expect((await wrapped('/api/facilities')).status).toBe(200)
    expect(askLogin).not.toHaveBeenCalled()
  })
})

describe('requestLogin cooldown', () => {
  it('does not reopen the login window right after the user closed it', async () => {
    vi.resetModules()
    const events: string[] = []
    vi.stubGlobal('window', {
      dispatchEvent: (event: Event) => { events.push(event.type) },
    })
    try {
      const auth = await import('./authRedirect')
      const first = auth.requestLogin()
      expect(events.length).toBe(1)
      auth.finishLogin(false)
      await expect(first).resolves.toBe(false)
      // React Query 자동 재시도(약 1초 뒤)가 와도 창을 다시 띄우지 않습니다.
      await expect(auth.requestLogin()).resolves.toBe(false)
      expect(events.length).toBe(1)
      // 직접 누른 로그인 버튼은 대기 시간과 상관없이 창을 엽니다.
      void auth.requestLogin(true)
      expect(events.length).toBe(2)
      auth.finishLogin(true)
      expect(events.at(-1)).toBe(auth.SESSION_CHANGED_EVENT)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
