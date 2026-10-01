import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { assertBuildEnvironment } from './scripts/lib/build-environment.mjs'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    assertBuildEnvironment({ mode, env: loadEnv(mode, process.cwd(), 'VITE_'), vercelEnv: process.env.VERCEL_ENV })
  }
  return { plugins: [react()] }
})
