export interface MensagemChat {
  autor: "bot" | "usuario";
  texto: string;
}

export interface WhatsAppStatus {
  ativo: boolean;
  conectado: boolean;
  tem_qr: boolean;
  qr_base64: string | null;
  telefone_conectado: string | null;
  ultima_atividade: string | null;
  erro: string | null;
  total_fila_pendente?: number;
  whatsapp_admin_notificacao?: string;
  envio_automatico?: boolean;
}

export interface GuiaVendas {
  empresa_nome: string;
  servicos_oferecidos: string;
  faixa_preco: string;
  formas_pagamento: string;
  nicho_alvo: string;
  dor_principal: string;
  objetivo_conversao: string;
  dias_horarios_reuniao: string;
  tom_conversa?: "profissional" | "amigavel" | "formal";
  estrategia_preco?: "sem_valor" | "margem" | "especifico";
  respostas_prontas: {
    interesse?: string;
    preco_caro?: string;
    ja_tem_site?: string;
    sem_tempo?: string;
    fechamento_direto?: string;
    recusa_desistencia?: string;
  };
}

export interface IaHunterLead {
  nome: string;
  telefone?: string;
  cidade?: string;
  estado?: string;
  site?: string;
  categoria?: string;
  diagnostico_ia?: string;
  pitch_sugerido?: string;
  query_origem?: string;
}

export interface IaHunterStatus {
  rodando: boolean;
  progresso: number;
  etapa: string;
  mensagem: string;
  queries_executadas: string[];
  total_web_encontrados: number;
  total_leads_salvos: number;
  leads: IaHunterLead[];
  erro: string | null;
  cancelar: boolean;
  iniciado_em?: string | null;
  finalizado_em?: string | null;
}

