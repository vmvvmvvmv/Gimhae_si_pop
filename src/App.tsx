import { AppProviders } from './app/providers'
import { AppRouter } from './app/router'
import LoginModal from './components/common/LoginModal'

export default function App() {
  // 모든 화면이 동일한 데이터 조회 설정을 쓰고, URL에 맞는 화면을 보여줍니다.
  // 로그인 창은 어느 화면에서든 기능 요청이 401을 받으면 열립니다.
  return (
    <AppProviders>
      <AppRouter />
      <LoginModal />
    </AppProviders>
  )
}
