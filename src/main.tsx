import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installLoginRetry } from './lib/authRedirect'

// 로그인이 필요한 기능을 쓰면 API가 401을 돌려주고, 로그인 창을 띄운 뒤 같은 요청을 다시 보냅니다.
installLoginRetry()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
