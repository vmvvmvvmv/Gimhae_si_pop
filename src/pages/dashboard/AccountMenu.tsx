import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../../lib/apiConfig'
import { SESSION_CHANGED_EVENT, requestLogin } from '../../lib/authRedirect'
import './AccountMenu.css'

type Session = { username: string; role: 'admin' | 'user' }

export default function AccountMenu() {
  const [session, setSession] = useState<Session | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    fetch(`${API_BASE_URL}/admin/session`, { credentials: 'include' })
      .then(async (response) => setSession(response.ok ? await response.json() as Session : null))
      .catch(() => setSession(null))
  }, [reloadKey])

  // 로그인 창에서 로그인하면 페이지 이동이 없으므로 이벤트로 표시를 갱신합니다.
  useEffect(() => {
    const refresh = () => setReloadKey((key) => key + 1)
    window.addEventListener(SESSION_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(SESSION_CHANGED_EVENT, refresh)
  }, [])

  const logout = async () => {
    await fetch(`${API_BASE_URL}/admin/logout`, { method: 'POST', credentials: 'include' })
    // 로그인해야 받을 수 있던 조회 결과가 화면과 캐시에 남지 않게 새로 불러옵니다.
    window.location.reload()
  }

  if (!session) {
    return (
      <div className="account-menu">
        <button type="button" onClick={() => void requestLogin(true)}>로그인</button>
      </div>
    )
  }

  return (
    <div className="account-menu">
      <span className="account-menu-name">{session.username}</span>
      <a href="/account">내 계정</a>
      {session.role === 'admin' && <a href="/admin">관리자</a>}
      <button type="button" onClick={() => void logout()}>로그아웃</button>
    </div>
  )
}
