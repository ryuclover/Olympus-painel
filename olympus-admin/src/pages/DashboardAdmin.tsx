import React, { useState, useEffect } from 'react'
import { 
  Users, UserPlus, Shield, ShieldAlert, Trash2, Key, CheckCircle, 
  XCircle, LogOut, Search, Flame, RefreshCw, Clock, Crown
} from 'lucide-react'
import { Usuario } from '../types'
import { supabase } from '../lib/supabase'

interface Props {
  usuarioLogado: any
  onLogout: () => void
}

export const DashboardAdmin: React.FC<Props> = ({ usuarioLogado, onLogout }) => {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [filtro, setFiltro] = useState('')
  const [modalNovo, setModalNovo] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // Campos para novo usuário
  const [novoNome, setNovoNome] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [novoPlano, setNovoPlano] = useState<'trial' | 'pro' | 'vitalicio'>('pro')
  const [novoCargo, setNovoCargo] = useState<'membro' | 'admin'>('membro')

  useEffect(() => {
    carregarUsuarios()
  }, [])

  const carregarUsuarios = async () => {
    setCarregando(true)
    setErro(null)
    try {
      if (!supabase) throw new Error('Supabase não configurado.')
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .order('criado_em', { ascending: false })

      if (error) throw error
      setUsuarios(data ?? [])
    } catch (e) {
      console.error(e)
      setUsuarios([])
      setErro('Não foi possível carregar as contas. Verifique as políticas de segurança do Supabase.')
    } finally {
      setCarregando(false)
    }
  }

  const executarAlteracao = async (operacao: () => Promise<{ error: any }>) => {
    setErro(null)
    const { error } = await operacao()
    if (error) {
      setErro('Operação recusada pelo servidor. Nenhuma alteração local foi aplicada.')
      return false
      }
    await carregarUsuarios()
    return true
  }

  const handleCriarUsuario = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('A criação de contas deve ser feita por uma Edge Function segura do Supabase. O navegador não envia nem armazena senhas.')
  }

  const handleToggleStatus = async (user: Usuario) => {
    const proximoStatus = user.status === 'ativo' ? 'bloqueado' : 'ativo'
    await executarAlteracao(async () => supabase!.from('usuarios').update({ status: proximoStatus }).eq('id', user.id))
  }

  const handlePromover = async (user: Usuario) => {
    const proximoCargo = user.cargo === 'admin' ? 'membro' : 'admin'
    await executarAlteracao(async () => supabase!.from('usuarios').update({ cargo: proximoCargo }).eq('id', user.id))
  }

  const handleExcluir = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta conta? O usuário perderá o acesso imediatamente.')) return
    await executarAlteracao(async () => supabase!.from('usuarios').delete().eq('id', id))
  }

  const usuariosFiltrados = usuarios.filter(u => 
    u.nome.toLowerCase().includes(filtro.toLowerCase()) || 
    u.email.toLowerCase().includes(filtro.toLowerCase())
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)', color: 'var(--text-primary)' }}>
      {/* Top Navbar */}
      <header style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            padding: 8,
            borderRadius: 10,
            color: '#fff',
            display: 'flex'
          }}>
            <Flame size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.5px' }}>Olympus Admin</h1>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Gerenciador Central de Licenças & Segurança</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{usuarioLogado?.nome || 'Superadmin'}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--accent-gold)' }}>Super Administrador</div>
          </div>
          <button
            onClick={onLogout}
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              padding: '8px 14px',
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.85rem',
              fontWeight: 600
            }}
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        {erro && (
          <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.35)', background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5' }}>
            {erro}
          </div>
        )}
        {/* Placar de Resumo */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: 20, borderRadius: 12 }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={16} color="var(--accent-blue)" /> Total de Contas
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: 6 }}>{usuarios.length}</div>
          </div>

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: 20, borderRadius: 12 }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={16} color="var(--accent-green)" /> Contas Ativas (.EXE liberado)
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: 6, color: 'var(--accent-green)' }}>
              {usuarios.filter(u => u.status === 'ativo').length}
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: 20, borderRadius: 12 }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldAlert size={16} color="var(--accent-red)" /> Bloqueadas / Revogadas
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: 6, color: 'var(--accent-red)' }}>
              {usuarios.filter(u => u.status === 'bloqueado').length}
            </div>
          </div>
        </div>

        {/* Barra de Ações */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', minWidth: 280 }}>
            <input
              type="text"
              placeholder="Buscar por nome ou e-mail..."
              value={filtro}
              onChange={e => setFiltro(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px 10px 36px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: '#fff',
                fontSize: '0.88rem'
              }}
            />
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={carregarUsuarios}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                padding: '10px 14px',
                borderRadius: 8,
                cursor: 'pointer'
              }}
              title="Recarregar lista"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={() => setModalNovo(true)}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                color: '#fff',
                padding: '10px 18px',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
              }}
            >
              <UserPlus size={18} /> Criar Nova Conta
            </button>
          </div>
        </div>

        {/* Tabela de Usuários */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 16px' }}>Usuário / E-mail</th>
                <th style={{ padding: '12px 16px' }}>Cargo</th>
                <th style={{ padding: '12px 16px' }}>Plano</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Ações de Controle</th>
              </tr>
            </thead>
            <tbody>
              {usuariosFiltrados.map(user => (
                <tr key={user.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 700, color: '#fff' }}>{user.nome}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{user.email}</div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      background: user.cargo === 'superadmin' ? 'rgba(245, 158, 11, 0.15)' : user.cargo === 'admin' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(107, 114, 128, 0.15)',
                      color: user.cargo === 'superadmin' ? 'var(--accent-gold)' : user.cargo === 'admin' ? '#60a5fa' : '#9ca3af',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      {user.cargo === 'superadmin' && <Crown size={12} />}
                      {user.cargo.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#e2e8f0' }}>
                      {user.plano.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      background: user.status === 'ativo' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: user.status === 'ativo' ? '#34d399' : '#f87171'
                    }}>
                      {user.status === 'ativo' ? '🟢 ATIVO (.EXE OK)' : '🔴 BLOQUEADO'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    {user.cargo !== 'superadmin' && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        <button
                          onClick={() => handleToggleStatus(user)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: user.status === 'ativo' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                            color: user.status === 'ativo' ? '#f87171' : '#34d399',
                            cursor: 'pointer',
                            fontSize: '0.78rem',
                            fontWeight: 600
                          }}
                          title={user.status === 'ativo' ? 'Bloquear acesso ao .exe' : 'Liberar acesso'}
                        >
                          {user.status === 'ativo' ? 'Bloquear' : 'Desbloquear'}
                        </button>

                        <button
                          onClick={() => handlePromover(user)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontSize: '0.78rem'
                          }}
                          title={user.cargo === 'admin' ? 'Rebaixar para Membro' : 'Promover para Admin'}
                        >
                          {user.cargo === 'admin' ? 'Rebaixar' : 'Promover Admin'}
                        </button>

                        <button
                          onClick={() => handleExcluir(user.id)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 6,
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            background: 'transparent',
                            color: '#ef4444',
                            cursor: 'pointer'
                          }}
                          title="Excluir usuário"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal Criar Novo Usuário */}
      {modalNovo && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 16
        }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: 24,
            width: '100%',
            maxWidth: 480
          }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: 16 }}>Criar Nova Conta / Licença</h3>

            <form onSubmit={handleCriarUsuario} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Nome do Cliente</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Carlos Silva"
                  value={novoNome}
                  onChange={e => setNovoNome(e.target.value)}
                  style={{ width: '100%', padding: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 4 }}>E-mail de Acesso</label>
                <input
                  type="email"
                  required
                  placeholder="cliente@empresa.com"
                  value={novoEmail}
                  onChange={e => setNovoEmail(e.target.value)}
                  style={{ width: '100%', padding: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Senha Inicial</label>
                <input
                  type="password"
                  required
                  placeholder="Defina uma senha segura"
                  value={novaSenha}
                  onChange={e => setNovaSenha(e.target.value)}
                  style={{ width: '100%', padding: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Plano</label>
                  <select
                    value={novoPlano}
                    onChange={e => setNovoPlano(e.target.value as any)}
                    style={{ width: '100%', padding: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff' }}
                  >
                    <option value="trial">Trial (7 dias)</option>
                    <option value="pro">Pro Mensal</option>
                    <option value="vitalicio">Vitalício</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Cargo</label>
                  <select
                    value={novoCargo}
                    onChange={e => setNovoCargo(e.target.value as any)}
                    style={{ width: '100%', padding: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff' }}
                  >
                    <option value="membro">Membro (Cliente)</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setModalNovo(false)}
                  style={{ padding: '10px 16px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ padding: '10px 18px', background: '#10b981', border: 'none', color: '#fff', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
                >
                  Salvar e Liberar .EXE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
