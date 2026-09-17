import React, { useState, useEffect } from 'react'
import { LoginPage } from './pages/LoginPage'
import { DashboardAdmin } from './pages/DashboardAdmin'
import { supabase } from './lib/supabase'

export function App() {
  const [usuario, setUsuario] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setCarregando(false)
      return
    }

    const carregarSessao = async () => {
      const cliente = supabase
      if (!cliente) return
      const { data: { session } } = await cliente.auth.getSession()
      await aplicarSessao(session?.user ?? null)
      setCarregando(false)
    }

    const aplicarSessao = async (user: any) => {
      const cliente = supabase
      if (!cliente) {
        setUsuario(null)
        return
      }
      if (!user) {
        setUsuario(null)
        return
      }

      const { data, error } = await cliente
        .from('usuarios')
        .select('id, nome, email, cargo, plano, status')
        .eq('email', user.email ?? '')
        .in('cargo', ['admin', 'superadmin'])
        .eq('status', 'ativo')
        .maybeSingle()

      if (error || !data) {
        await cliente.auth.signOut()
        setUsuario(null)
        return
      }

      setUsuario(data)
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
    await supabase?.auth.signOut()
    setUsuario(null)
  }

  if (carregando) return null

  if (!usuario) {
    return <LoginPage onLoginSuccess={setUsuario} />
  }

  return <DashboardAdmin usuarioLogado={usuario} onLogout={handleLogout} />
}

export default App
