import React, { useState, useEffect } from 'react'
import { LoginPage } from './pages/LoginPage'
import { DashboardAdmin } from './pages/DashboardAdmin'

export function App() {
  const [usuario, setUsuario] = useState<any>(null)

  useEffect(() => {
    const salvo = localStorage.getItem('olympus_admin_session')
    if (salvo) {
      try {
        setUsuario(JSON.parse(salvo))
      } catch (e) {
        localStorage.removeItem('olympus_admin_session')
      }
    }
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('olympus_admin_session')
    setUsuario(null)
  }

  if (!usuario) {
    return <LoginPage onLoginSuccess={setUsuario} />
  }

  return <DashboardAdmin usuarioLogado={usuario} onLogout={handleLogout} />
}

export default App
