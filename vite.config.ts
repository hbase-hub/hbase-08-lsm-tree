import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/hbase-08-lsm-tree/',
  server: {
    port: 54308,
  },
})
