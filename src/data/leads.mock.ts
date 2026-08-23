export type LeadStatus = "novo" | "quente" | "morno" | "frio" | "contatado" | "qualificado" | "fechado";
export type KanbanStage = "novo" | "qualificado" | "contatado" | "interessado" | "fechado";

export interface Lead {
  id: string;
  empresa: string;
  categoria: string;
  avaliacao: number;
  totalAvaliacoes: number;
  telefone: string;
  score: number;
  status: LeadStatus;
  etapa: KanbanStage;
  endereco: string;
  cidade: string;
  estado: string;
  site?: string;
  email?: string;
  enriquecimento: {
    instagram: boolean;
    email: boolean;
    site: boolean;
    whatsappBusiness: boolean;
    horarioFuncionamento?: string;
  };
  avaliacaoDistribuicao: { estrelas: number; quantidade: number }[];
  tags: string[];
  observacao?: string;
  valorFechado?: number;
  lat: number;
  lng: number;
  fotoUrl?: string;
  tipoTelefone?: string;
  temWhatsapp?: boolean;
}

export const LEADS_MOCK: Lead[] = [
  { id:"1", empresa:"MultiVacinas", categoria:"Clinica medica", avaliacao:4.8, totalAvaliacoes:87, telefone:"+55 51 99960-8056", score:85, status:"quente", etapa:"novo", endereco:"Av. Brasil, 1756", cidade:"Sao Joao", estado:"RS", enriquecimento:{instagram:false,email:false,site:false,whatsappBusiness:true,horarioFuncionamento:"Seg a Sab 08:00 - 18:00"}, avaliacaoDistribuicao:[{estrelas:5,quantidade:52},{estrelas:4,quantidade:22},{estrelas:3,quantidade:8},{estrelas:2,quantidade:3},{estrelas:1,quantidade:2}], tags:["Clinica","Saude","Alta Renda"], lat:-30.033, lng:-51.23 },
  { id:"2", empresa:"Renata Cassel - Infectolo...", categoria:"Clinica medica", avaliacao:4.6, totalAvaliacoes:54, telefone:"+55 51 99117-5645", score:82, status:"quente", etapa:"novo", endereco:"Rua Independencia, 220", cidade:"Porto Alegre", estado:"RS", enriquecimento:{instagram:true,email:false,site:false,whatsappBusiness:false}, avaliacaoDistribuicao:[{estrelas:5,quantidade:40},{estrelas:4,quantidade:10},{estrelas:3,quantidade:3},{estrelas:2,quantidade:1},{estrelas:1,quantidade:0}], tags:["Infectologia"], lat:-30.021, lng:-51.22 },
  { id:"3", empresa:"Massoterapia", categoria:"Clinica de fisioterapia", avaliacao:4.7, totalAvaliacoes:32, telefone:"+55 51 90660-3677", score:78, status:"quente", etapa:"novo", endereco:"Rua das Flores, 890", cidade:"Porto Alegre", estado:"RS", enriquecimento:{instagram:false,email:true,site:false,whatsappBusiness:true}, avaliacaoDistribuicao:[{estrelas:5,quantidade:24},{estrelas:4,quantidade:6},{estrelas:3,quantidade:2},{estrelas:2,quantidade:0},{estrelas:1,quantidade:0}], tags:["Fisioterapia","Bem-estar"], lat:-30.040, lng:-51.21 },
  { id:"4", empresa:"Clinica Teichert Odonto...", categoria:"Odontologia", avaliacao:4.9, totalAvaliacoes:112, telefone:"+55 51 9507-67526", score:75, status:"quente", etapa:"qualificado", endereco:"Av. Protasio Alves, 3300", cidade:"Porto Alegre", estado:"RS", enriquecimento:{instagram:true,email:true,site:true,whatsappBusiness:true,horarioFuncionamento:"Seg a Sex 08:00 - 19:00"}, avaliacaoDistribuicao:[{estrelas:5,quantidade:90},{estrelas:4,quantidade:16},{estrelas:3,quantidade:4},{estrelas:2,quantidade:1},{estrelas:1,quantidade:1}], tags:["Odonto","Alto Padrao"], lat:-30.055, lng:-51.19 },
  { id:"5", empresa:"Estrategia Saude da Fa...", categoria:"Clinica medica", avaliacao:4.2, totalAvaliacoes:28, telefone:"+55 51 31100-4391", score:68, status:"morno", etapa:"contatado", endereco:"Rua Anita Garibaldi, 550", cidade:"Porto Alegre", estado:"RS", enriquecimento:{instagram:false,email:false,site:false,whatsappBusiness:false}, avaliacaoDistribuicao:[{estrelas:5,quantidade:15},{estrelas:4,quantidade:8},{estrelas:3,quantidade:3},{estrelas:2,quantidade:1},{estrelas:1,quantidade:1}], tags:["Clinica"], lat:-30.028, lng:-51.24 },
  { id:"6", empresa:"Clinica Vida", categoria:"Clinica medica", avaliacao:4.4, totalAvaliacoes:65, telefone:"+55 51 99111-2233", score:65, status:"morno", etapa:"contatado", endereco:"Rua Lima e Silva, 200", cidade:"Porto Alegre", estado:"RS", enriquecimento:{instagram:true,email:false,site:false,whatsappBusiness:true}, avaliacaoDistribuicao:[{estrelas:5,quantidade:44},{estrelas:4,quantidade:15},{estrelas:3,quantidade:4},{estrelas:2,quantidade:1},{estrelas:1,quantidade:1}], tags:["Saude"], lat:-30.035, lng:-51.22 },
  { id:"7", empresa:"NeuroClin", categoria:"Clinica neurologica", avaliacao:4.5, totalAvaliacoes:43, telefone:"+55 51 98123-2211", score:61, status:"morno", etapa:"interessado", endereco:"Av. Ipiranga, 6681", cidade:"Porto Alegre", estado:"RS", enriquecimento:{instagram:false,email:true,site:false,whatsappBusiness:false}, avaliacaoDistribuicao:[{estrelas:5,quantidade:30},{estrelas:4,quantidade:10},{estrelas:3,quantidade:2},{estrelas:2,quantidade:1},{estrelas:1,quantidade:0}], tags:["Neurologia"], lat:-30.062, lng:-51.17 },
  { id:"8", empresa:"Dermato Prime", categoria:"Dermatologia", avaliacao:4.8, totalAvaliacoes:91, telefone:"+55 51 98123-2211", score:61, status:"frio", etapa:"qualificado", endereco:"Rua Mostardeiro, 333", cidade:"Porto Alegre", estado:"RS", enriquecimento:{instagram:true,email:true,site:true,whatsappBusiness:true}, avaliacaoDistribuicao:[{estrelas:5,quantidade:70},{estrelas:4,quantidade:17},{estrelas:3,quantidade:3},{estrelas:2,quantidade:1},{estrelas:1,quantidade:0}], tags:["Dermatologia","Estetica"], lat:-30.019, lng:-51.20 },
  { id:"9", empresa:"FisioAtiva", categoria:"Fisioterapia", avaliacao:4.3, totalAvaliacoes:18, telefone:"+55 51 98001-1122", score:55, status:"frio", etapa:"contatado", endereco:"Rua Gen. Lima e Silva, 742", cidade:"Porto Alegre", estado:"RS", enriquecimento:{instagram:false,email:false,site:false,whatsappBusiness:false}, avaliacaoDistribuicao:[{estrelas:5,quantidade:12},{estrelas:4,quantidade:4},{estrelas:3,quantidade:1},{estrelas:2,quantidade:1},{estrelas:1,quantidade:0}], tags:["Fisioterapia"], lat:-30.044, lng:-51.23 },
  { id:"10", empresa:"Clinica Bem Estar", categoria:"Clinica medica", avaliacao:4.1, totalAvaliacoes:22, telefone:"+55 57 96644-5566", score:50, status:"frio", etapa:"fechado", endereco:"Rua Venancio Aires, 400", cidade:"Porto Alegre", estado:"RS", enriquecimento:{instagram:false,email:false,site:false,whatsappBusiness:false}, avaliacaoDistribuicao:[{estrelas:5,quantidade:14},{estrelas:4,quantidade:5},{estrelas:3,quantidade:2},{estrelas:2,quantidade:1},{estrelas:1,quantidade:0}], tags:["Clinica"], lat:-30.049, lng:-51.25 },
];
