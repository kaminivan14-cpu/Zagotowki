import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --configLoader native',
    url: 'http://127.0.0.1:5173', reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: 'https://auth-tests.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-test-key' },
  },
})
