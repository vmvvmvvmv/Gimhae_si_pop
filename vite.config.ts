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
  build: {
    rolldownOptions: {
      output: {
        // 자주 바뀌지 않는 라이브러리를 따로 묶어서 앱 코드가 바뀌어도 캐시가 유지되게 합니다.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('proj4')) return 'geo'
          if (id.includes('@tanstack') || id.includes('react-router')) return 'data'
          if (id.includes('react')) return 'react'
          return 'vendor'
        },
      },
    },
  },
})
