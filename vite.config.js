import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { assertBuildEnvironment } from './scripts/lib/build-environment.mjs'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  let environment = 'development'
  if (command === 'build') {
    environment = assertBuildEnvironment({ mode, env: loadEnv(mode, process.cwd(), 'VITE_'), vercelEnv: process.env.VERCEL_ENV })
  } else if (process.env.VITE_SUPABASE_URL === 'https://auth-tests.supabase.co' || loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL === 'https://meuzkduxttjcuiynsnaa.supabase.co') {
    environment = 'uat'
  }
  return { plugins: [react()], define: { __APP_ENVIRONMENT__: JSON.stringify(environment) } }
})
