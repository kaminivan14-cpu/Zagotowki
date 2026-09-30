import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AuthGate from './auth/AuthGate.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthGate />
  </StrictMode>,
)
