import { useState } from 'react'
import type { FormEvent } from 'react'
import { postJson } from '../../lib/postJson'
import './LoginModal.css'

export type AuthMode = 'login' | 'signup' | 'signup-confirm' | 'reset-request' | 'reset-confirm'

const TITLES: Record<AuthMode, string> = {
  login: '로그인이 필요합니다',
  signup: '회원가입 신청',
  'signup-confirm': '가입 코드 입력',
  'reset-request': '비밀번호 재설정',
  'reset-confirm': '재설정 코드 입력',
}

// 로그인·가입 신청·비밀번호 재설정 입력 폼입니다. 로그인 창과 /login 페이지가 함께 씁니다.
export default function AuthForms({ initialMode = 'login', onLoggedIn, onClose }: {
  initialMode?: AuthMode
  onLoggedIn: () => void
  onClose?: () => void
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  const goTo = (next: AuthMode) => {
    setMode(next)
    setError('')
    setNotice('')
    setPassword('')
    setConfirmPassword('')
    setCode('')
  }

  // 공통 제출 처리: 진행 표시, 오류 표시를 맡습니다.
  const run = async (action: () => Promise<void>, fallback: string) => {
    setLoading(true)
    setError('')
    try {
      await action()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : fallback)
    } finally {
      setLoading(false)
    }
  }

  const submitLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void run(async () => {
      await postJson('/admin/login', { username, password, remember })
      // 로그인이 성공해야 막혀 있던 요청을 다시 보냅니다.
      onLoggedIn()
    }, '로그인에 실패했습니다.')
  }

  const submitSignup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (password !== confirmPassword) return
    void run(async () => {
      await postJson('/auth/signup', { username, password })
      setPassword('')
      setConfirmPassword('')
      setMode('signup-confirm')
      setNotice('가입 신청이 접수되었습니다. 관리자가 알려 준 코드를 입력하면 계정이 만들어집니다.')
    }, '가입 신청에 실패했습니다.')
  }

  const submitSignupConfirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void run(async () => {
      await postJson('/auth/signup/confirm', { username, code: code.trim() })
      setCode('')
      setMode('login')
      setNotice('계정이 만들어졌습니다. 신청할 때 정한 비밀번호로 로그인하세요.')
    }, '가입을 완료하지 못했습니다.')
  }

  const submitResetRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void run(async () => {
      await postJson('/auth/password-reset/request', { username })
      setMode('reset-confirm')
      setNotice('관리자에게 재설정을 요청했습니다. 관리자가 알려 준 코드를 입력하세요.')
    }, '요청에 실패했습니다.')
  }

  const submitResetConfirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (password !== confirmPassword) return
    void run(async () => {
      await postJson('/auth/password-reset/confirm', {
        username,
        code: code.trim(),
        new_password: password,
      })
      setPassword('')
      setConfirmPassword('')
      setCode('')
      setMode('login')
      setNotice('비밀번호가 바뀌었습니다. 새 비밀번호로 로그인하세요.')
    }, '비밀번호를 바꾸지 못했습니다.')
  }

  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword

  return (
    <>
    <div className="login-modal-header">
      <h2 id="login-modal-title">{TITLES[mode]}</h2>
      {onClose && (
        <button type="button" className="login-modal-close" aria-label="로그인 창 닫기" onClick={onClose}>
          ×
        </button>
      )}
    </div>

    {mode === 'login' && (
      <>
        <form onSubmit={submitLogin}>
          <label>
            아이디
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            비밀번호
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label className="login-modal-remember">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            로그인 유지 (관리자 제외)
          </label>
          {notice && <p role="status" className="login-modal-notice">{notice}</p>}
          {error && <p role="alert" className="login-modal-error">{error}</p>}
          <div className="login-modal-actions">
            {onClose && <button type="button" onClick={onClose}>취소</button>}
            <button type="submit" disabled={loading}>{loading ? '로그인 중…' : '로그인'}</button>
          </div>
        </form>
      </>
    )}

    {mode === 'signup' && (
      <>
        <p>신청 후 관리자에게 받은 코드를 입력하면 계정이 만들어집니다.</p>
        <form onSubmit={submitSignup}>
          <label>
            아이디(영문·숫자·._- , 3~50자)
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              pattern="[A-Za-z0-9_.\-]{3,50}"
              autoComplete="username"
              required
            />
          </label>
          <label>
            비밀번호(10자 이상)
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={10}
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            비밀번호 확인
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={10}
              autoComplete="new-password"
              required
            />
          </label>
          {passwordMismatch && <p role="alert" className="login-modal-error">비밀번호가 서로 다릅니다.</p>}
          {error && <p role="alert" className="login-modal-error">{error}</p>}
          <div className="login-modal-actions">
            <button type="button" onClick={() => goTo('login')}>로그인으로</button>
            <button type="submit" disabled={loading}>{loading ? '신청 중…' : '가입 신청'}</button>
          </div>
        </form>
        <p className="login-modal-links">
          <button type="button" className="login-modal-link" onClick={() => goTo('signup-confirm')}>이미 코드를 받았어요</button>
        </p>
      </>
    )}

    {mode === 'signup-confirm' && (
      <>
        <p>관리자가 준 일회용 코드는 24시간 동안 유효합니다.</p>
        <form onSubmit={submitSignupConfirm}>
          <label>
            아이디
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            가입 코드
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="one-time-code"
              required
            />
          </label>
          {notice && <p role="status" className="login-modal-notice">{notice}</p>}
          {error && <p role="alert" className="login-modal-error">{error}</p>}
          <div className="login-modal-actions">
            <button type="button" onClick={() => goTo('login')}>로그인으로</button>
            <button type="submit" disabled={loading}>{loading ? '확인 중…' : '가입 완료'}</button>
          </div>
        </form>
      </>
    )}

    {mode === 'reset-request' && (
      <>
        <p>아이디를 입력하면 관리자에게 재설정 요청이 전달됩니다.</p>
        <form onSubmit={submitResetRequest}>
          <label>
            아이디
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
          {error && <p role="alert" className="login-modal-error">{error}</p>}
          <div className="login-modal-actions">
            <button type="button" onClick={() => goTo('login')}>로그인으로</button>
            <button type="submit" disabled={loading}>{loading ? '요청 중…' : '재설정 요청'}</button>
          </div>
        </form>
        <p className="login-modal-links">
          <button type="button" className="login-modal-link" onClick={() => goTo('reset-confirm')}>이미 코드를 받았어요</button>
        </p>
      </>
    )}

    {mode === 'reset-confirm' && (
      <>
        <p>관리자가 준 일회용 코드는 30분 동안만 유효합니다.</p>
        <form onSubmit={submitResetConfirm}>
          <label>
            아이디
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            재설정 코드
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="one-time-code"
              required
            />
          </label>
          <label>
            새 비밀번호(10자 이상)
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={10}
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            새 비밀번호 확인
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={10}
              autoComplete="new-password"
              required
            />
          </label>
          {passwordMismatch && <p role="alert" className="login-modal-error">비밀번호가 서로 다릅니다.</p>}
          {notice && <p role="status" className="login-modal-notice">{notice}</p>}
          {error && <p role="alert" className="login-modal-error">{error}</p>}
          <div className="login-modal-actions">
            <button type="button" onClick={() => goTo('login')}>로그인으로</button>
            <button type="submit" disabled={loading}>{loading ? '바꾸는 중…' : '비밀번호 바꾸기'}</button>
          </div>
        </form>
      </>
    )}

    {mode === 'login' && (
      <p className="login-modal-links">
        <button type="button" className="login-modal-link" onClick={() => goTo('signup')}>회원가입 신청</button>
        {' · '}
        <button type="button" className="login-modal-link" onClick={() => goTo('reset-request')}>비밀번호를 잊으셨나요?</button>
      </p>
    )}
    </>
  )
}
