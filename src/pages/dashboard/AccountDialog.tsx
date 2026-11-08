import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { postJson } from '../../lib/postJson'
import '../../components/common/LoginModal.css'

export type AccountDialogMode = 'username' | 'password'

const USERNAME_PATTERN = '[A-Za-z0-9_.\\-]{3,50}'

export default function AccountDialog({ mode, onClose, onChanged }: {
  mode: AccountDialogMode
  onClose: () => void
  onChanged: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [newUsername, setNewUsername] = useState('')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    dialogRef.current?.showModal()
    dialogRef.current?.querySelector('input')?.focus()
  }, [])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (mode === 'password' && next !== confirm) {
      setError('새 비밀번호가 서로 다릅니다.')
      return
    }
    setLoading(true)
    try {
      if (mode === 'username') {
        await postJson('/auth/username', { new_username: newUsername, current_password: current })
        setNotice(`아이디를 ${newUsername.toLowerCase()}(으)로 바꿨습니다. 다른 기기의 로그인은 끊겼습니다.`)
        onChanged()
      } else {
        await postJson('/auth/password', { current_password: current, new_password: next })
        setNotice('비밀번호를 바꿨습니다. 다른 기기의 로그인은 끊겼습니다.')
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '변경하지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const close = () => dialogRef.current?.close()

  return (
    <dialog ref={dialogRef} className="login-modal" aria-labelledby="account-dialog-title" onClose={onClose}>
      <div className="login-modal-body">
        <div className="login-modal-header">
          <h2 id="account-dialog-title">{mode === 'username' ? '아이디 변경' : '비밀번호 변경'}</h2>
          <button type="button" className="login-modal-close" onClick={close} aria-label="닫기">×</button>
        </div>
        {notice ? (
          <>
            <p role="status" className="login-modal-notice">{notice}</p>
            <div className="login-modal-actions">
              <button type="button" onClick={close}>닫기</button>
            </div>
          </>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            {mode === 'username' && (
              <label>
                새 아이디 (영문·숫자·_.- 3~50자)
                <input value={newUsername} onChange={(event) => setNewUsername(event.target.value)} pattern={USERNAME_PATTERN} autoComplete="username" required />
              </label>
            )}
            <label>
              현재 비밀번호
              <input type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" required />
            </label>
            {mode === 'password' && (
              <>
                <label>
                  새 비밀번호 (10자 이상)
                  <input type="password" value={next} onChange={(event) => setNext(event.target.value)} minLength={10} autoComplete="new-password" required />
                </label>
                <label>
                  새 비밀번호 확인
                  <input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} minLength={10} autoComplete="new-password" required />
                </label>
              </>
            )}
            {error && <p role="alert" className="login-modal-error">{error}</p>}
            <div className="login-modal-actions">
              <button type="button" onClick={close}>취소</button>
              <button type="submit" disabled={loading}>{loading ? '변경 중…' : '변경'}</button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  )
}
