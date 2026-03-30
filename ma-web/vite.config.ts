/// <reference types="vitest" />
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/modes/**/*.ts'],
      thresholds: { lines: 80 },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Ma — 間',
        short_name: 'Ma',
        description: '2 minutes. No streak. No guilt. Just presence.',
        theme_color: '#1a1a1a',
        background_color: '#1a1a1a',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // オフラインでもタイマー+ベルが動くように静的アセットをキャッシュ
        globPatterns: ['**/*.{js,css,html,ico,png,mp3,woff2}'],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
