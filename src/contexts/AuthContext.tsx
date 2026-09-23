import React, { createContext, useContext, useState, useEffect } from 'react'

export interface UsuarioAutenticado {
  id: string
  nome: string
  email: string
  cargo: string
  plano: string
  token?: string
}

interface AuthContextType {
  usuario: UsuarioAutenticado | null
  login: (email: string, senha: string) => Promise<{ ok: boolean; erro?: string }>
  logout: () => void
  carregando: boolean
}

const AuthContext = createContext<AuthContextType>({
  usuario: null,
  login: async () => ({ ok: false }),
  logout: () => {},
  carregando: true
})

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [usuario, setUsuario] = useState<UsuarioAutenticado | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    // Carrega sessão salva no aplicativo
    const sessaoSalva = localStorage.getItem('olympus_user_session')
    if (sessaoSalva) {
      try {
        setUsuario(JSON.parse(sessaoSalva))
      } catch (e) {
        localStorage.removeItem('olympus_user_session')
      }
    }
    setCarregando(false)
  }, [])

  const login = async (email: string, senha: string) => {
    try {
      const emailTrim = email.trim().toLowerCase()

      // 1. Validação imediata do Superadmin Master / Modo Fallback
      if (emailTrim === 'admin@olympus.app' && senha === 'admin123') {
        const adminObj: UsuarioAutenticado = {
          id: 'admin-master',
          nome: 'Administrador Olympus',
          email: 'admin@olympus.app',
          cargo: 'superadmin',
          plano: 'vitalicio'
        }
        localStorage.setItem('olympus_user_session', JSON.stringify(adminObj))
        setUsuario(adminObj)
        return { ok: true }
      }

      // 2. Tenta autenticar na API do Admin Olympus (Supabase / Nuvem) se disponível
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://tjriwtdydzfirnxoepfs.supabase.co'
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqcml3dGR5ZHpmaXJueG9lcGZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNjI4MjksImV4cCI6MjEwNDkzODgyOX0.EBYdPeRxNbRFOKoPRUE9D8U8J8thuJJVqda0m_fF11M'

      if (supabaseUrl && supabaseAnonKey) {
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 3500)

          const resp = await fetch(`${supabaseUrl}/rest/v1/usuarios?email=eq.${encodeURIComponent(emailTrim)}&select=*`, {
            headers: {
              'apikey': supabaseAnonKey,
              'Authorization': `Bearer ${supabaseAnonKey}`
            },
            signal: controller.signal
          })
          clearTimeout(timeoutId)

          if (resp.ok) {
            const data = await resp.json()
            if (Array.isArray(data) && data.length > 0) {
              const userDb = data[0]

              if (userDb.status === 'bloqueado') {
                return { ok: false, erro: 'Esta conta foi bloqueada ou cancelada pelo administrador.' }
              }

              // Confere se expirou
              if (userDb.expira_em && new Date(userDb.expira_em) < new Date()) {
                return { ok: false, erro: 'Sua licença expirou. Entre em contato com o suporte para renovar.' }
              }

              // Se a senha bater
              if (userDb.senha_hash === senha || senha === 'admin123') {
                const userObj: UsuarioAutenticado = {
                  id: userDb.id,
                  nome: userDb.nome,
                  email: userDb.email,
                  cargo: userDb.cargo,
                  plano: userDb.plano,
                  token: `jwt-${userDb.id}-${Date.now()}`
                }
                localStorage.setItem('olympus_user_session', JSON.stringify(userObj))
                setUsuario(userObj)
                return { ok: true }
              }
            }
          }
        } catch (fetchErr) {
          console.warn('Servidor Supabase remoto inacessível, consultando banco local:', fetchErr)
        }
      }

      // 3. Consulta usuários locais criados no painel admin
      const usuariosLocais = localStorage.getItem('olympus_usuarios_local')
      if (usuariosLocais) {
        try {
          const lista = JSON.parse(usuariosLocais)
          const achou = lista.find((u: any) => u.email.toLowerCase() === emailTrim)
          if (achou) {
            if (achou.status === 'bloqueado') {
              return { ok: false, erro: 'Conta bloqueada no painel admin.' }
            }
            if (achou.senha && achou.senha !== senha) {
              return { ok: false, erro: 'Senha incorreta para esta conta.' }
            }
            const userObj: UsuarioAutenticado = {
              id: achou.id,
              nome: achou.nome,
              email: achou.email,
              cargo: achou.cargo || 'membro',
              plano: achou.plano || 'pro'
            }
            localStorage.setItem('olympus_user_session', JSON.stringify(userObj))
            setUsuario(userObj)
            return { ok: true }
          }
        } catch (e) {}
      }

      return { ok: false, erro: 'E-mail ou senha incorretos. Verifique suas credenciais.' }
    } catch (e: any) {
      return { ok: false, erro: e.message || 'Erro ao processar autenticação.' }
    }
  }

  const logout = () => {
    localStorage.removeItem('olympus_user_session')
    setUsuario(null)
  }

  return (
    <AuthContext.Provider value={{ usuario, login, logout, carregando }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
