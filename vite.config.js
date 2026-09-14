import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // GitHub Pages project site: https://lay-01.github.io/pgio/
  base: '/pgio/',
  server: {
    port: 3000,
  },
})