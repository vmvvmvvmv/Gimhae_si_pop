import { BrowserRouter, Route, Routes } from 'react-router-dom'
import DashboardPage from '../pages/DashboardPage'
import MapServiceMockupPage from '../pages/MapServiceMockupPage'
import LoginPage from '../pages/LoginPage'
import AdminPage from '../pages/AdminPage'
import ReportFiguresPage from '../pages/ReportFiguresPage'
import NotFoundPage from '../pages/NotFoundPage'
import SignupPage from '../pages/SignupPage'
import PasswordResetPage from '../pages/PasswordResetPage'
import AccountPage from '../pages/AccountPage'

// 목업과 보고서 도구는 개발할 때만 보입니다. 운영 빌드에서는 NotFound로 처리됩니다.
const SHOW_DEV_PAGES = import.meta.env.DEV

export function AppRouter() {
  // 주소 경로에 따라 한 화면을 선택합니다. 실제 서비스 첫 화면은 / 입니다.
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        {SHOW_DEV_PAGES && <Route path="/ui-concept" element={<MapServiceMockupPage />} />}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/password-reset" element={<PasswordResetPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/admin" element={<AdminPage />} />
        {SHOW_DEV_PAGES && <Route path="/report-figures" element={<ReportFiguresPage />} />}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
