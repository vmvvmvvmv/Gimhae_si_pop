import { Link } from 'react-router-dom'
import ReportFigureMaker from '../components/common/ReportFigureMaker'
import { useAccessState } from '../features/auth/useSession'
import { requestLogin } from '../lib/authRedirect'
import './ReportFiguresPage.css'

export default function ReportFiguresPage() {
  const access = useAccessState()
  return (
    <main className="report-figures-page">
      <header className="report-figures-header">
        <Link to="/" aria-label="김해 생활지도로 돌아가기">← 김해 생활지도</Link>
        <span>GIMHAE GIS</span>
      </header>
      <div className="report-figures-content">
        {access === 'open' && <ReportFigureMaker />}
        {access === 'locked' && (
          <div className="report-figures-locked">
            <strong>로그인하면 GIS 자료를 이용할 수 있습니다</strong>
            <button
              type="button"
              onClick={() => void requestLogin(true).then((loggedIn) => {
                if (loggedIn) window.location.reload()
              })}
            >
              로그인
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
