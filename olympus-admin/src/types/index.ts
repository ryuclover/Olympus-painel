export interface Usuario {
  id: string
  nome: string
  email: string
  senha_hash?: string
  cargo: 'superadmin' | 'admin' | 'membro'
  plano: 'trial' | 'pro' | 'vitalicio'
  status: 'ativo' | 'bloqueado' | 'expirado'
  expira_em?: string | null
  criado_em: string
  ultimo_login?: string | null
}
