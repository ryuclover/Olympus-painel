import React, { useState } from 'react'
import { Flame, Mail, Lock, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export const LoginScreen: React.FC = () => {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const handleEntrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    setLoading(true)

    const res = await login(email, senha)
    if (!res.ok) {
      setErro(res.erro || 'Falha ao autenticar.')
    }
    setLoading(false)
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'radial-gradient(circle at top, #1e293b 0%, #0a0d14 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: 16
    }}>
      <div style={{
        background: '#111827',
        border: '1px solid #242f47',
        borderRadius: 16,
        padding: '36px 32px',
        width: '100%',
        maxWidth: 420,
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)',
        color: '#f3f4f6'
      }}>
        {/* Cabeçalho */}
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
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
            boxShadow: '0 0 24px rgba(245, 158, 11, 0.35)'
          }}>
            <Flame size={28} />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>
            Olympus Painel
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '0.84rem', marginTop: 4 }}>
            Insira suas credenciais para liberar o executável
          </p>
        </div>

        {/* Mensagem de Erro */}
        {erro && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 8,
            padding: '10px 12px',
            color: '#fca5a5',
            fontSize: '0.84rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 18
          }}>
            <AlertCircle size={16} />
            <span>{erro}</span>
          </div>
        )}

        {/* Formulário */}
        <form onSubmit={handleEntrar} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#9ca3af', marginBottom: 6 }}>
              E-mail da Conta
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                required
                placeholder="seu-email@exemplo.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 12px 11px 38px',
                  background: '#1a2234',
                  border: '1px solid #242f47',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
              <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#9ca3af', marginBottom: 6 }}>
              Senha de Acesso
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
                  background: '#1a2234',
                  border: '1px solid #242f47',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
              <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
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
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.25)'
            }}
          >
            {loading ? <Loader2 size={18} className="spin" /> : <ShieldCheck size={18} />}
            {loading ? 'Autenticando...' : 'Entrar no Olympus'}
          </button>
        </form>

        <div style={{ marginTop: 22, textAlign: 'center', borderTop: '1px solid #242f47', paddingTop: 14 }}>
          <span style={{ fontSize: '0.74rem', color: '#6b7280' }}>
            Acesso Protegido por Licença • Olympus Security
          </span>
        </div>
      </div>
    </div>
  )
}
