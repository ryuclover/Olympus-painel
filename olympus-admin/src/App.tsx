import React, { useState, useEffect } from 'react'
import { LoginPage } from './pages/LoginPage'
import { DashboardAdmin } from './pages/DashboardAdmin'
import { supabase } from './lib/supabase'

export function App() {
  const [usuario, setUsuario] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    // 1. Verifica se já há uma sessão de admin salva localmente
    const sessaoSalva = localStorage.getItem('olympus_admin_session')
    if (sessaoSalva) {
      try {
        const adminObj = JSON.parse(sessaoSalva)
        if (adminObj && adminObj.cargo && (adminObj.cargo === 'superadmin' || adminObj.cargo === 'admin')) {
          setUsuario(adminObj)
          setCarregando(false)
          return
        }
      } catch (e) {
        localStorage.removeItem('olympus_admin_session')
      }
    }

    if (!supabase) {
      setCarregando(false)
      return
    }

    const carregarSessao = async () => {
      const cliente = supabase
      if (!cliente) {
        setCarregando(false)
        return
      }
      try {
        const { data: { session } } = await cliente.auth.getSession()
        await aplicarSessao(session?.user ?? null)
      } catch (err) {
        console.warn('Erro ao checar sessão remota Supabase:', err)
      } finally {
        setCarregando(false)
      }
    }

    const aplicarSessao = async (user: any) => {
      const cliente = supabase
      if (!cliente || !user) {
        return
      }

      try {
        const { data, error } = await cliente
          .from('usuarios')
          .select('id, nome, email, cargo, plano, status')
          .eq('email', user.email ?? '')
          .in('cargo', ['admin', 'superadmin'])
          .eq('status', 'ativo')
          .maybeSingle()

        if (error || !data) {
          return
        }

        setUsuario(data)
        localStorage.setItem('olympus_admin_session', JSON.stringify(data))
      } catch (err) {
        console.warn('Erro ao validar perfil de admin:', err)
      }
    }

    carregarSessao()
    const cliente = supabase
    if (!cliente) return
    const { data: listener } = cliente.auth.onAuthStateChange((_event, session) => {
      void aplicarSessao(session?.user ?? null)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    localStorage.removeItem('olympus_admin_session')
    try {
      await supabase?.auth.signOut()
    } catch {}
    setUsuario(null)
  }

  if (carregando) return null

  if (!usuario) {
    return <LoginPage onLoginSuccess={setUsuario} />
  }

  return <DashboardAdmin usuarioLogado={usuario} onLogout={handleLogout} />
}

export default App
