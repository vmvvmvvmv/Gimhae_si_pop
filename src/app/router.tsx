import { BrowserRouter, Route, Routes } from 'react-router-dom'
import DashboardPage from '../pages/DashboardPage'
import MapServiceMockupPage from '../pages/MapServiceMockupPage'
import LoginPage from '../pages/LoginPage'
import AdminPage from '../pages/AdminPage'
import NotFoundPage from '../pages/NotFoundPage'

export function AppRouter() {
  // 주소 경로에 따라 한 화면을 선택합니다. 실제 서비스 첫 화면은 / 입니다.
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/ui-concept" element={<MapServiceMockupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
