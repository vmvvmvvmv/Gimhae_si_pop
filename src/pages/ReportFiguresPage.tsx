import { Link } from 'react-router-dom'
import ReportFigureMaker from '../components/common/ReportFigureMaker'
import './ReportFiguresPage.css'

export default function ReportFiguresPage() {
  return (
    <main className="report-figures-page">
      <header className="report-figures-header">
        <Link to="/" aria-label="김해 생활지도로 돌아가기">← 김해 생활지도</Link>
        <span>GIMHAE GIS</span>
      </header>
      <div className="report-figures-content">
        <ReportFigureMaker />
      </div>
    </main>
  )
}
