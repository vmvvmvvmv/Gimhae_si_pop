import { useState } from 'react'
import type { FormEvent } from 'react'
import { API_BASE_URL } from '../lib/apiConfig'
import './AuthPages.css'
import { safeNextPath } from '../lib/authRedirect'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/admin/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { detail?: string }
        if (response.status === 429) {
          const seconds = Number(response.headers.get('Retry-After'))
          throw new Error(Number.isFinite(seconds) && seconds > 0
            ? `로그인 시도가 많습니다. ${seconds}초 후 다시 시도해 주세요.`
            : body.detail || '잠시 후 다시 시도해 주세요.')
        }
        throw new Error(body.detail || '로그인에 실패했습니다.')
      }
      window.location.assign(safeNextPath(new URLSearchParams(window.location.search).get('next')))
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : '로그인에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <h1>로그인</h1>
      <form onSubmit={submit}>
        <label>
          아이디
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
        </label>
        <label>
          비밀번호
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        </label>
        <button type="submit" disabled={loading}>{loading ? '로그인 중…' : '로그인'}</button>
        {error && <p role="alert">{error}</p>}
      </form>
      <p><a href="/signup">회원가입 신청</a> · <a href="/password-reset">비밀번호를 잊으셨나요?</a></p>
    </main>
  )
}
