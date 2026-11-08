import { Suspense, lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import DashboardPage from '../pages/DashboardPage'

// 대시보드 말고는 처음 방문할 때 필요 없으므로 필요한 순간에만 내려받습니다.
const LoginPage = lazy(() => import('../pages/LoginPage'))
const SignupPage = lazy(() => import('../pages/SignupPage'))
const PasswordResetPage = lazy(() => import('../pages/PasswordResetPage'))
const AccountPage = lazy(() => import('../pages/AccountPage'))
const AdminPage = lazy(() => import('../pages/AdminPage'))
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'))
// 목업과 보고서 도구는 개발할 때만 보입니다. 운영 빌드에서는 NotFound로 처리됩니다.
const SHOW_DEV_PAGES = import.meta.env.DEV
const MapServiceMockupPage = lazy(() => import('../pages/MapServiceMockupPage'))
const ReportFiguresPage = lazy(() => import('../pages/ReportFiguresPage'))

export function AppRouter() {
  // 주소 경로에 따라 한 화면을 선택합니다. 실제 서비스 첫 화면은 / 입니다.
  return (
    <BrowserRouter>
      <Suspense fallback={<main><p>불러오는 중…</p></main>}>
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
      </Suspense>
    </BrowserRouter>
  )
}
