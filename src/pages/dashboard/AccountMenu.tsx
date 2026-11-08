import { useEffect, useId, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { API_BASE_URL } from '../../lib/apiConfig'
import { SESSION_CHANGED_EVENT } from '../../lib/authRedirect'
import { useSession } from '../../features/auth/useSession'
import AccountDialog, { type AccountDialogMode } from './AccountDialog'
import './AccountMenu.css'

export default function AccountMenu() {
  const session = useSession().data ?? null
  const queryClient = useQueryClient()
  const popoverId = useId()
  const [dialogMode, setDialogMode] = useState<AccountDialogMode | null>(null)

  // 로그인 창에서 로그인하면 페이지 이동이 없으므로 이벤트로 표시를 갱신합니다.
  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ['session'] })
      // 로그인 전에 401로 실패한 조회만 다시 불러옵니다. 성공한 지도 데이터까지 새로 받으면 지도를 다시 그리게 됩니다.
      void queryClient.refetchQueries({ predicate: (query) => query.state.status === 'error' })
    }
    window.addEventListener(SESSION_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(SESSION_CHANGED_EVENT, refresh)
  }, [queryClient])

  const logout = async () => {
    await fetch(`${API_BASE_URL}/admin/logout`, { method: 'POST', credentials: 'include' })
    // 로그인해야 받을 수 있던 조회 결과가 화면과 캐시에 남지 않게 새로 불러옵니다.
    window.location.reload()
  }

  if (!session) return null

  return (
    <div className="account-menu">
      <button type="button" className="account-menu-name" popoverTarget={popoverId} title={session.username}>
        <span>{session.username}</span>
      </button>
      <div id={popoverId} popover="auto" className="account-menu-popover">
        <button type="button" onClick={() => setDialogMode('username')}>아이디 변경</button>
        <button type="button" onClick={() => setDialogMode('password')}>비밀번호 변경</button>
        {session.role === 'admin' && <a href="/admin">관리자</a>}
        <button type="button" onClick={() => void logout()}>로그아웃</button>
      </div>
      {dialogMode && (
        <AccountDialog
          mode={dialogMode}
          onClose={() => setDialogMode(null)}
          onChanged={() => void queryClient.invalidateQueries({ queryKey: ['session'] })}
        />
      )}
    </div>
  )
}
