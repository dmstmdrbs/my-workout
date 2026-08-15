import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Trainlog',
        short_name: 'Trainlog',
        description: 'RIR 기반 개인 운동 기록 및 루틴 관리 앱',
        theme_color: '#171717',
        background_color: '#171717',
        display: 'standalone',
        start_url: '/',
      },
    }),
  ],
})
