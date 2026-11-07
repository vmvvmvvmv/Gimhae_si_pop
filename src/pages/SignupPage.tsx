import { useState } from 'react'
import type { FormEvent } from 'react'
import { API_BASE_URL } from '../lib/apiConfig'

export default function SignupPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('비밀번호가 서로 다릅니다.')
      return
    }
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { detail?: string }
        throw new Error(body.detail || '가입 신청에 실패했습니다.')
      }
      setSubmitted(true)
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : '가입 신청에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <main>
        <h1>가입 신청이 접수되었습니다</h1>
        <p>관리자가 승인하면 로그인할 수 있습니다. 승인 전에는 로그인이 되지 않습니다.</p>
        <a href="/login">로그인 화면으로</a>
      </main>
    )
  }

  return (
    <main>
      <h1>회원가입 신청</h1>
      <p>신청 후 관리자가 승인해야 계정이 만들어집니다.</p>
      <form onSubmit={submit}>
        <label>
          아이디(영문·숫자·._- , 3~50자)
          <input value={username} onChange={(event) => setUsername(event.target.value)} pattern="[A-Za-z0-9_.\-]{3,50}" autoComplete="username" required />
        </label>
        <label>
          비밀번호(10자 이상)
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} autoComplete="new-password" required />
        </label>
        <label>
          비밀번호 확인
          <input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} minLength={10} autoComplete="new-password" required />
        </label>
        <button type="submit" disabled={loading}>{loading ? '신청 중…' : '가입 신청'}</button>
        {error && <p role="alert">{error}</p>}
      </form>
      <a href="/login">로그인으로 돌아가기</a>
    </main>
  )
}
