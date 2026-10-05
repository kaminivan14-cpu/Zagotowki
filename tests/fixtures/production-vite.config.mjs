import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
// Isolated browser policy harness: production UI rules with a fake, intercepted backend.
export default defineConfig({plugins:[react()],define:{__APP_ENVIRONMENT__:JSON.stringify('production')}})
