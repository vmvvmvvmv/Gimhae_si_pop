// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AuthForms from './AuthForms'

function stubFetch(status: number, body: unknown = {}) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AuthForms', () => {
  it('로그인 유지 선택을 함께 보내고 성공하면 알린다', async () => {
    const fetchMock = stubFetch(200)
    const onLoggedIn = vi.fn()
    render(<AuthForms onLoggedIn={onLoggedIn} />)

    type('아이디', 'kim')
    type('비밀번호', 'long-enough-password')
    fireEvent.click(screen.getByLabelText('로그인 유지 (관리자 제외)'))
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))

    await waitFor(() => expect(onLoggedIn).toHaveBeenCalledOnce())
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/admin/login')
    expect(JSON.parse(String(init.body))).toEqual({
      username: 'kim',
      password: 'long-enough-password',
      remember: true,
    })
  })

  it('서버 오류 메시지를 한 번만 보여 준다', async () => {
    stubFetch(401, { detail: '아이디 또는 비밀번호가 올바르지 않습니다.' })
    const onLoggedIn = vi.fn()
    render(<AuthForms onLoggedIn={onLoggedIn} />)

    type('아이디', 'kim')
    type('비밀번호', 'wrong')
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))

    const alerts = await screen.findAllByRole('alert')
    expect(alerts.map((alert) => alert.textContent)).toEqual(['아이디 또는 비밀번호가 올바르지 않습니다.'])
    expect(onLoggedIn).not.toHaveBeenCalled()
  })

  it('가입 신청은 비밀번호가 다르면 보내지 않고 안내를 한 번만 보여 준다', () => {
    const fetchMock = stubFetch(202)
    render(<AuthForms initialMode="signup" onLoggedIn={vi.fn()} />)

    type('아이디(영문·숫자·._- , 3~50자)', 'new_user')
    type('비밀번호(10자 이상)', 'long-enough-password')
    type('비밀번호 확인', 'different-password')
    fireEvent.click(screen.getByRole('button', { name: '가입 신청' }))

    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toEqual(['비밀번호가 서로 다릅니다.'])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('이미 코드를 받았으면 요청 없이 코드 입력으로 넘어간다', () => {
    const fetchMock = stubFetch(202)
    render(<AuthForms onLoggedIn={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '비밀번호를 잊으셨나요?' }))
    fireEvent.click(screen.getByRole('button', { name: '이미 코드를 받았어요' }))

    expect(screen.getByLabelText('재설정 코드')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('페이지에서 쓸 때는 닫기와 취소 버튼을 보여 주지 않는다', () => {
    render(<AuthForms onLoggedIn={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '로그인 창 닫기' })).toBeNull()
    expect(screen.queryByRole('button', { name: '취소' })).toBeNull()
  })
})
