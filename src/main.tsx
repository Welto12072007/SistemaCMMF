import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { registrarLog } from './lib/logger'
import App from './App'
import './index.css'

// Captura erros não tratados (JS + promises) pro Controle de Logs, independente de onde aconteçam
window.addEventListener('error', (e) => {
  registrarLog({
    action: 'erro_js',
    entity: 'frontend',
    details: { message: e.message, filename: e.filename, lineno: e.lineno, stack: e.error?.stack },
    level: 'error',
    status: 'erro',
  })
})
window.addEventListener('unhandledrejection', (e) => {
  registrarLog({
    action: 'promise_rejeitada',
    entity: 'frontend',
    details: { reason: String(e.reason), stack: e.reason?.stack },
    level: 'error',
    status: 'erro',
  })
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)

// Register service worker for PWA, and force-refresh clients when a new version activates
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      // Catch updates that were already waiting when this tab loaded
      registration.update()
      setInterval(() => registration.update(), 60 * 60 * 1000)
    })
  })

  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
}
