import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installLoginRedirect } from './lib/authRedirect'

// 로그인이 필요한 기능을 쓰면 API가 401을 돌려주고, 그때 로그인 화면으로 보냅니다.
installLoginRedirect()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
