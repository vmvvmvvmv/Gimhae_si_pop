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

export function AppRouter() {
  // 주소 경로에 따라 한 화면을 선택합니다. 실제 서비스 첫 화면은 / 입니다.
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/ui-concept" element={<MapServiceMockupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/password-reset" element={<PasswordResetPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/report-figures" element={<ReportFiguresPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
