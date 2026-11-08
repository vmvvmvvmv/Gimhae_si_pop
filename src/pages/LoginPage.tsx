import AuthForms, { type AuthMode } from '../components/common/AuthForms'
import { safeNextPath } from '../lib/authRedirect'

// /login, /signup, /password-reset 주소가 처음 보여 줄 폼만 다르게 해서 함께 씁니다.
export default function LoginPage({ initialMode = 'login' }: { initialMode?: AuthMode }) {
  const goToNextPage = () => {
    window.location.assign(safeNextPath(new URLSearchParams(window.location.search).get('next')))
  }
  return (
    <main className="login-modal auth-standalone">
      <div className="login-modal-body">
        <AuthForms initialMode={initialMode} onLoggedIn={goToNextPage} />
      </div>
    </main>
  )
}
