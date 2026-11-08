import { useCallback, useEffect, useRef, useState } from 'react'
import { LOGIN_REQUIRED_EVENT, finishLogin } from '../../lib/authRedirect'
import AuthForms from './AuthForms'
import './LoginModal.css'

// 기능을 쓰는 중에 로그인이 필요해지면, 페이지를 떠나지 않고 이 창에서 처리합니다.
// 다른 모달(예: 내보내기 창)이 이미 열려 있어도 맨 위에 보이도록 네이티브 <dialog>를 씁니다.
export default function LoginModal() {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  // 창을 열 때마다 입력 폼을 새로 만들어 이전 입력과 오류가 남지 않게 합니다.
  const [formKey, setFormKey] = useState(0)

  // 전역 "로그인 필요" 이벤트를 듣고 창을 엽니다.
  useEffect(() => {
    const show = () => {
      setFormKey((key) => key + 1)
      setOpen(true)
    }
    window.addEventListener(LOGIN_REQUIRED_EVENT, show)
    return () => window.removeEventListener(LOGIN_REQUIRED_EVENT, show)
  }, [])

  const close = useCallback((loggedIn: boolean) => {
    setOpen(false)
    finishLogin(loggedIn)
  }, [])

  // open 상태에 맞춰 네이티브 다이얼로그를 열고 닫습니다.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      dialog.querySelector('input')?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

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
        <AuthForms key={formKey} onLoggedIn={() => close(true)} onClose={() => close(false)} />
      </div>
    </dialog>
  )
}
