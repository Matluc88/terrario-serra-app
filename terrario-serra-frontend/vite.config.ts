import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    __VITE_API_BASE_URL__: JSON.stringify(process.env.VITE_API_BASE_URL || 'http://localhost:8000')
  },
  preview: {
    host: true,
    port: process.env.PORT ? parseInt(process.env.PORT) : 4173,
    allowedHosts: ['terrario-serra-app-1.onrender.com']
  },
  server: {
    host: true,
    port: 5173
  }
})

