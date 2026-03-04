import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://test-chat.atomic-dns.com:36000',
        changeOrigin: true,
      },
      // 개발 시 /health도 같은 백엔드로 보내서 CORS 없이 연결 확인 (GET은 되는데 POST만 실패하는 현상 방지)
      '/health': {
        target: 'http://test-chat.atomic-dns.com:36000',
        changeOrigin: true,
      },
    },
  },
})
