import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 개발 중에도 화면과 API가 같은 주소를 쓰게 해서, 로그인 쿠키가 그대로 전달되게 합니다.
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
