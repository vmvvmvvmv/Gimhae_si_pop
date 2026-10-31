import { AppProviders } from './app/providers'
import { AppRouter } from './app/router'

export default function App() {
  // 모든 화면이 동일한 데이터 조회 설정을 쓰고, URL에 맞는 화면을 보여줍니다.
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  )
}
