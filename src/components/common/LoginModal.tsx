import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { postJson } from '../../lib/postJson'
import { LOGIN_REQUIRED_EVENT, finishLogin } from '../../lib/authRedirect'
import './LoginModal.css'

type Mode = 'login' | 'signup' | 'reset-request' | 'reset-confirm'

const TITLES: Record<Mode, string> = {
  login: '로그인이 필요합니다',
  signup: '회원가입 신청',
  'reset-request': '비밀번호 재설정',
  'reset-confirm': '재설정 코드 입력',
}

// 기능을 쓰는 중에 로그인이 필요해지면, 페이지를 떠나지 않고 이 창에서 처리합니다.
// 다른 모달(예: 내보내기 창)이 이미 열려 있어도 맨 위에 보이도록 네이티브 <dialog>를 씁니다.
export default function LoginModal() {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const usernameRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  // 전역 "로그인 필요" 이벤트를 듣고 창을 엽니다.
  useEffect(() => {
    const show = () => {
      setMode('login')
      setError('')
      setNotice('')
      setPassword('')
      setOpen(true)
    }
    window.addEventListener(LOGIN_REQUIRED_EVENT, show)
    return () => window.removeEventListener(LOGIN_REQUIRED_EVENT, show)
  }, [])

  const close = useCallback((loggedIn: boolean) => {
    setOpen(false)
    setPassword('')
    setConfirmPassword('')
    setCode('')
    finishLogin(loggedIn)
  }, [])

  // open 상태에 맞춰 네이티브 다이얼로그를 열고 닫습니다.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      usernameRef.current?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const goTo = (next: Mode) => {
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
      close(true)
    }, '로그인에 실패했습니다.')
  }

  const submitSignup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (password !== confirmPassword) return
    void run(async () => {
      await postJson('/auth/signup', { username, password })
      setUsername('')
      setPassword('')
      setConfirmPassword('')
      setMode('login')
      setNotice('가입 신청이 접수되었습니다. 관리자가 승인하면 로그인할 수 있습니다.')
    }, '가입 신청에 실패했습니다.')
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
    <dialog
      ref={dialogRef}
      className="login-modal"
      aria-labelledby="login-modal-title"
      onCancel={(event) => {
        // Esc 키는 브라우저가 기본으로 닫아 버리므로, 우리 쪽 정리 로직을 거치게 합니다.
        event.preventDefault()
        close(false)
      }}
    >
      <div className="login-modal-body">
        <div className="login-modal-header">
          <h2 id="login-modal-title">{TITLES[mode]}</h2>
          <button type="button" className="login-modal-close" aria-label="로그인 창 닫기" onClick={() => close(false)}>
            ×
          </button>
        </div>

        {mode === 'login' && (
          <>
            <form onSubmit={submitLogin}>
              <label>
                아이디
                <input
                  ref={usernameRef}
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
                로그인 유지
              </label>
              {notice && <p role="status" className="login-modal-notice">{notice}</p>}
              {error && <p role="alert" className="login-modal-error">{error}</p>}
              <div className="login-modal-actions">
                <button type="button" onClick={() => close(false)}>취소</button>
                <button type="submit" disabled={loading}>{loading ? '로그인 중…' : '로그인'}</button>
              </div>
            </form>
          </>
        )}

        {mode === 'signup' && (
          <>
            <p>신청 후 관리자가 승인해야 계정이 만들어집니다.</p>
            <form onSubmit={submitSignup}>
              <label>
                아이디(영문·숫자·._- , 3~50자)
                <input
                  ref={usernameRef}
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
          </>
        )}

        {mode === 'reset-request' && (
          <>
            <p>아이디를 입력하면 관리자에게 재설정 요청이 전달됩니다.</p>
            <form onSubmit={submitResetRequest}>
              <label>
                아이디
                <input
                  ref={usernameRef}
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
          </>
        )}

        {mode === 'reset-confirm' && (
          <>
            <p>관리자가 준 일회용 코드는 30분 동안만 유효합니다.</p>
            <form onSubmit={submitResetConfirm}>
              <label>
                아이디
                <input
                  ref={usernameRef}
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
      </div>
    </dialog>
  )
}
