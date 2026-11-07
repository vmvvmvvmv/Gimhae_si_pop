import { useState } from 'react'
import type { FormEvent } from 'react'
import { API_BASE_URL } from '../lib/apiConfig'

async function failureMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => ({})) as { detail?: string }
  return body.detail || fallback
}

export default function PasswordResetPage() {
  const [step, setStep] = useState<'request' | 'confirm' | 'done'>('request')
  const [username, setUsername] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const requestReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE_URL}/auth/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      if (!response.ok) throw new Error(await failureMessage(response, '요청에 실패했습니다.'))
      setStep('confirm')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '요청에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const confirmReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE_URL}/auth/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, code: code.trim(), new_password: password }),
      })
      if (!response.ok) throw new Error(await failureMessage(response, '비밀번호를 바꾸지 못했습니다.'))
      setStep('done')
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : '비밀번호를 바꾸지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'done') {
    return (
      <main>
        <h1>비밀번호가 바뀌었습니다</h1>
        <a href="/login">새 비밀번호로 로그인</a>
      </main>
    )
  }

  if (step === 'confirm') {
    return (
      <main>
        <h1>비밀번호 재설정</h1>
        <p>관리자가 승인하면 일회용 코드를 알려 줍니다. 코드는 30분 동안만 유효합니다.</p>
        <form onSubmit={confirmReset}>
          <label>
            아이디
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
          </label>
          <label>
            관리자에게 받은 코드
            <input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" required />
          </label>
          <label>
            새 비밀번호(10자 이상)
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} autoComplete="new-password" required />
          </label>
          <button type="submit" disabled={loading}>{loading ? '변경 중…' : '비밀번호 바꾸기'}</button>
          {error && <p role="alert">{error}</p>}
        </form>
      </main>
    )
  }

  return (
    <main>
      <h1>비밀번호 재설정 요청</h1>
      <p>아이디를 입력하면 관리자에게 재설정 요청이 전달됩니다.</p>
      <form onSubmit={requestReset}>
        <label>
          아이디
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
        </label>
        <button type="submit" disabled={loading}>{loading ? '요청 중…' : '재설정 요청'}</button>
        {error && <p role="alert">{error}</p>}
      </form>
      <button type="button" onClick={() => setStep('confirm')}>이미 코드를 받았어요</button>
      <a href="/login">로그인으로 돌아가기</a>
    </main>
  )
}
