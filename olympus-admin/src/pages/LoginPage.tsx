import React, { useState } from 'react'
import { Flame, Lock, Mail, ShieldCheck, AlertCircle, Loader2, Chrome } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface Props {
  onLoginSuccess: (usuario: any) => void
}

export const LoginPage: React.FC<Props> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    setLoading(true)

    try {
      if (!supabase) {
        throw new Error('Autenticação não configurada. Defina as variáveis do Supabase na Vercel.')
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: senha
      })

      if (error || !data.user) {
        throw new Error('E-mail ou senha incorretos.')
      }

      onLoginSuccess(data.user)
    } catch (err: any) {
      setErro(err.message || 'Erro ao realizar login.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setErro(null)
    if (!supabase) {
      setErro('Autenticação não configurada. Defina as variáveis do Supabase na Vercel.')
      return
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    })

    if (error) setErro('Não foi possível iniciar o login com Google.')
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at top, #1e293b 0%, #0a0d14 100%)',
      padding: 16
    }}>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: 36,
        width: '100%',
        maxWidth: 420,
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 52,
            height: 52,
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            borderRadius: 14,
            color: '#fff',
            marginBottom: 12,
            boxShadow: '0 0 20px rgba(245, 158, 11, 0.3)'
          }}>
            <Flame size={28} />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>
            Olympus Admin
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 4 }}>
            Acesso Restrito ao Painel de Segurança & Contas
          </p>
        </div>

        {erro && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 8,
            padding: '10px 12px',
            color: '#fca5a5',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 20
          }}>
            <AlertCircle size={16} />
            <span>{erro}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              E-mail do Administrador
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                required
                placeholder="admin@olympus.app"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 12px 11px 38px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
              <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Senha
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 12px 11px 38px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
              <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 10,
              padding: '12px',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.2)'
            }}
          >
            {loading ? <Loader2 size={18} className="spin" /> : <ShieldCheck size={18} />}
            {loading ? 'Validando...' : 'Acessar Painel Admin'}
          </button>
        </form>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            marginTop: 12,
            width: '100%',
            padding: '12px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8
          }}
        >
          <Chrome size={18} /> Entrar com Google
        </button>

        <div style={{ marginTop: 24, textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            Proteção de Cibersegurança SHA-256 / Bcrypt Ativa
          </span>
        </div>
      </div>
    </div>
  )
}
