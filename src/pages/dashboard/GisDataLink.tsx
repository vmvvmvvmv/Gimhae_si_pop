import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAccessState } from '../../features/auth/useSession'
import { requestLogin } from '../../lib/authRedirect'

const GIS_DATA_PATH = '/report-figures'

// 로그인 전에는 자료 페이지로 이동하지 않고 로그인 창을 띄운 뒤, 로그인하면 이동합니다.
export default function GisDataLink({ className, children }: { className?: string; children: ReactNode }) {
  const locked = useAccessState() === 'locked'
  return (
    <Link
      className={className}
      to={GIS_DATA_PATH}
      onClick={(event) => {
        if (!locked) return
        event.preventDefault()
        void requestLogin(true).then((loggedIn) => {
          if (loggedIn) window.location.assign(GIS_DATA_PATH)
        })
      }}
    >
      {children}
    </Link>
  )
}
