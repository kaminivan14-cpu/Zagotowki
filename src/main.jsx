import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import LanguageSwitcher from './i18n'
import AuthGate from './auth/AuthGate.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageSwitcher /><AuthGate />
  </StrictMode>,
)
