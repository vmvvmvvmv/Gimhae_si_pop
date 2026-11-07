import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { API_BASE_URL } from '../lib/apiConfig'
import { loginUrlFor } from '../lib/authRedirect'

export default function AccountPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'unauthenticated'>('loading')
  const [username, setUsername] = useState('')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${API_BASE_URL}/admin/session`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('unauthenticated')
        const body = await response.json() as { username: string }
        setUsername(body.username)
        setState('ready')
      })
      .catch(() => setState('unauthenticated'))
  }, [])

  if (state === 'loading') return <main><p>확인 중…</p></main>
  if (state === 'unauthenticated') {
    return <main><p>로그인이 필요합니다.</p><a href={loginUrlFor('/account')}>로그인으로 이동</a></main>
  }

  const change = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')
    setError('')
    if (next !== confirm) {
      setError('새 비밀번호가 서로 다릅니다.')
      return
    }
    const response = await fetch(`${API_BASE_URL}/auth/password`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: current, new_password: next }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { detail?: string }
      setError(body.detail || '비밀번호를 바꾸지 못했습니다.')
      return
    }
    setCurrent('')
    setNext('')
    setConfirm('')
    setMessage('비밀번호를 바꿨습니다. 이 기기 외의 로그인은 모두 끊겼습니다.')
  }

  return (
    <main>
      <h1>내 계정</h1>
      <p>{username}님으로 로그인했습니다.</p>
      <h2>비밀번호 변경</h2>
      <form onSubmit={change}>
        <label>
          현재 비밀번호
          <input type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" required />
        </label>
        <label>
          새 비밀번호(10자 이상)
          <input type="password" value={next} onChange={(event) => setNext(event.target.value)} minLength={10} autoComplete="new-password" required />
        </label>
        <label>
          새 비밀번호 확인
          <input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} minLength={10} autoComplete="new-password" required />
        </label>
        <button type="submit">변경하기</button>
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
      </form>
      <a href="/">대시보드로 돌아가기</a>
    </main>
  )
}
