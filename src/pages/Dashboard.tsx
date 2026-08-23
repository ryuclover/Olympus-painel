// ...
import { useState, useEffect } from "react";
import { 
  BarChart3, Target, CheckCircle2, MessageSquare, 
  Users, Briefcase, Filter, List, X
} from "lucide-react";
import { LeadRow } from "../components/leads/LeadRow";
import { LeadFechadoModal } from "../components/leads/LeadFechadoModal";
import type { Lead } from "../data/leads.mock";
import "./Dashboard.css";

// ... (keep NichoMetrica, DashboardMetrics, ApiLead, apiLeadToLead as they are)
interface NichoMetrica {
  categoria: string;
  total: number;
  contatados: number;
  fechados: number;
}

interface DashboardMetrics {
  total_leads: number;
  funil: Record<string, number>;
  nichos: NichoMetrica[];
  score_medio_novo: number;
  score_medio_contatado: number;
}

interface ApiLead {
  place_id: string;
  nome: string;
  categoria: string;
  avaliacao: number;
  total_avaliacoes: number;
  telefone: string;
  endereco: string;
  cidade: string;
  estado: string;
  site: string;
  site_status: string;
  lat: number;
  lng: number;
  score: number;
  status: string;
  tags: string;
  valor_fechado?: number;
  observacoes?: string;
}

function apiLeadToLead(a: ApiLead): Lead {
  return {
    id: a.place_id,
    empresa: a.nome,
    categoria: a.categoria,
    avaliacao: a.avaliacao ?? 0,
    totalAvaliacoes: a.total_avaliacoes ?? 0,
    telefone: a.telefone ?? "",
    score: a.score ?? 0,
    status: (a.status as Lead["status"]) ?? "novo",
    etapa: "novo",
    endereco: a.endereco ?? "",
    cidade: a.cidade ?? "",
    estado: a.estado ?? "",
    site: a.site || undefined,
    valorFechado: a.valor_fechado ?? 0,
    enriquecimento: {
      instagram: false, email: false,
      site: !!a.site && a.site_status === "ok",
      whatsappBusiness: false,
    },
    avaliacaoDistribuicao: [5,4,3,2,1].map(e => ({ estrelas: e, quantidade: 0 })),
    tags: a.tags ? a.tags.split(",").filter(Boolean) : [],
    lat: a.lat ?? 0, lng: a.lng ?? 0,
    observacao: a.observacoes,
  };
}

export function Dashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [leadsAndamento, setLeadsAndamento] = useState<Lead[]>([]);
  const [leadsFechados, setLeadsFechados] = useState<Lead[]>([]);
  const [leadsIgnorados, setLeadsIgnorados] = useState<Lead[]>([]);
  const [activeTab, setActiveTab] = useState<"andamento" | "fechados" | "ignorados">("andamento");
  const [loading, setLoading] = useState(true);

  // Popup de Status (apenas para leads em andamento)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [salvandoStatus, setSalvandoStatus] = useState(false);
  // Modal de Fechamento (apenas para leads fechados)
  const [leadFechado, setLeadFechado] = useState<Lead | null>(null);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = () => {
    Promise.all([
      fetch("/api/dashboard/metrics").then(r => r.json()),
      fetch("/api/leads?status=em_andamento&limit=100").then(r => r.json()),
      fetch("/api/leads?status=fechado&limit=100").then(r => r.json()),
      fetch("/api/leads?status=ignorado&limit=100").then(r => r.json())
    ])
    .then(([metricsData, leadsData, fechadosData, ignoradosData]) => {
      setMetrics(metricsData);
      setLeadsAndamento((leadsData.leads ?? []).map(apiLeadToLead));
      setLeadsFechados((fechadosData.leads ?? []).map(apiLeadToLead));
      setLeadsIgnorados((ignoradosData.leads ?? []).map(apiLeadToLead));
      setLoading(false);
    })
    .catch(e => {
      console.error("Erro ao carregar dashboard", e);
      setLoading(false);
    });
  };

  const handleMudarStatus = async (novoStatus: string) => {
    if (!selectedLead) return;
    setSalvandoStatus(true);
    try {
      const r = await fetch(`/api/leads/${selectedLead.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novoStatus })
      });
      if (r.ok) {
        // Atualiza a lista local temporariamente, depois recarrega do backend
        setLeadsAndamento(prev => prev.map(l => l.id === selectedLead.id ? { ...l, status: novoStatus as any } : l));
        setSelectedLead(null);
        setTimeout(() => carregarDados(), 500); // recarrega metricas tbm
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSalvandoStatus(false);
    }
  };

  if (loading || !metrics) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
        <BarChart3 className="spin" size={24} style={{ marginRight: 8 }} /> Carregando métricas...
      </div>
    );
  }

  const { total_leads, funil, nichos } = metrics;
  const totalContatados = (funil['contatados'] || 0) + (funil['respondeu'] || 0) + (funil['qualificado'] || 0) + (funil['fechado'] || 0) + (funil['contatado'] || 0);
  const totalFechados = funil['fechado'] || 0;
  
  const txConversao = totalContatados > 0 ? ((totalFechados / totalContatados) * 100).toFixed(1) : "0.0";
  const txAproveitamento = total_leads > 0 ? ((totalContatados / total_leads) * 100).toFixed(1) : "0.0";

  return (
    <div className="dashboard-page" style={{ display: "block" }}>
      <header className="dash-header">
        <div>
          <h2>Visão Geral do Olympus</h2>
          <p className="text-muted">Acompanhe suas métricas de prospecção e conversão.</p>
        </div>
      </header>

      <div className="dash-grid">
        <div className="dash-card primary">
          <div className="dash-card-icon"><Users size={24} /></div>
          <div className="dash-card-info">
            <span className="dash-card-title">Total de Leads</span>
            <span className="dash-card-value">{total_leads}</span>
          </div>
        </div>
        <div className="dash-card">
          <div className="dash-card-icon" style={{ color: 'var(--accent-blue)' }}><MessageSquare size={24} /></div>
          <div className="dash-card-info">
            <span className="dash-card-title">Leads Contatados</span>
            <span className="dash-card-value">{totalContatados}</span>
            <span className="dash-card-sub">{txAproveitamento}% do total</span>
          </div>
        </div>
        <div className="dash-card success">
          <div className="dash-card-icon"><CheckCircle2 size={24} /></div>
          <div className="dash-card-info">
            <span className="dash-card-title">Leads Fechados</span>
            <span className="dash-card-value">{totalFechados}</span>
            <span className="dash-card-sub">{txConversao}% de conversão</span>
          </div>
        </div>
        <div className="dash-card warning">
          <div className="dash-card-icon"><Target size={24} /></div>
          <div className="dash-card-info">
            <span className="dash-card-title">Qualificados / Em Progresso</span>
            <span className="dash-card-value">{(funil['qualificado'] || 0) + (funil['respondeu'] || 0)}</span>
          </div>
        </div>
      </div>

      <div className="dash-columns">
        <div className="dash-panel">
          <h3 className="dash-panel-title"><Filter size={18} /> Funil de Vendas</h3>
          <div className="funnel-container">
            {[
              { status: 'novo', label: 'Novos', color: '#6b7280' },
              { status: 'contatado', label: 'Contatados', color: '#3b82f6' },
              { status: 'respondeu', label: 'Responderam', color: '#8b5cf6' },
              { status: 'qualificado', label: 'Qualificados', color: '#f59e0b' },
              { status: 'fechado', label: 'Fechados', color: '#10b981' },
            ].map(etapa => {
              const valor = funil[etapa.status] || 0;
              const max = Math.max(...Object.values(funil), 1);
              const pct = (valor / max) * 100;
              return (
                <div key={etapa.status} className="funnel-row">
                  <div className="funnel-label">{etapa.label}</div>
                  <div className="funnel-track">
                    <div className="funnel-fill" style={{ width: `${pct}%`, backgroundColor: etapa.color }} />
                  </div>
                  <div className="funnel-value">{valor}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="dash-panel">
          <h3 className="dash-panel-title"><Briefcase size={18} /> Top Nichos Encontrados</h3>
          <div className="nicho-list">
            {nichos.length === 0 ? (
              <p className="text-muted" style={{ padding: '20px 0', textAlign: 'center' }}>Nenhum nicho com dados suficientes.</p>
            ) : (
              <table className="nicho-table">
                <thead>
                  <tr>
                    <th>Nicho</th>
                    <th style={{ textAlign: 'center' }}>Total</th>
                    <th style={{ textAlign: 'center' }}>Contatados</th>
                    <th style={{ textAlign: 'center' }}>Fechados</th>
                  </tr>
                </thead>
                <tbody>
                  {nichos.map(n => (
                    <tr key={n.categoria}>
                      <td><strong>{n.categoria}</strong></td>
                      <td style={{ textAlign: 'center' }}>{n.total}</td>
                      <td style={{ textAlign: 'center', color: 'var(--accent-blue)' }}>{n.contatados}</td>
                      <td style={{ textAlign: 'center', color: 'var(--accent-green)', fontWeight: 600 }}>{n.fechados}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      
      {/* TABELA DE LEADS CONTATADOS */}
      <div className="dash-panel mt-4" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 20, borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: "flex", gap: 24 }}>
            <h3 
              className={`dash-panel-title ${activeTab === 'andamento' ? 'active' : ''}`}
              style={{ margin: 0, cursor: 'pointer', color: activeTab === 'andamento' ? 'var(--text-primary)' : 'var(--text-muted)' }}
              onClick={() => setActiveTab('andamento')}
            >
              <List size={18} /> 
              Leads em Andamento
              <span className="badge-count" style={{ marginLeft: 8 }}>{leadsAndamento.length}</span>
            </h3>
            <h3 
              className={`dash-panel-title ${activeTab === 'fechados' ? 'active' : ''}`}
              style={{ margin: 0, cursor: 'pointer', color: activeTab === 'fechados' ? 'var(--text-primary)' : 'var(--text-muted)' }}
              onClick={() => setActiveTab('fechados')}
            >
              <CheckCircle2 size={18} /> 
              Finalizados
              <span className="badge-count" style={{ marginLeft: 8 }}>{leadsFechados.length}</span>
            </h3>
            <h3 
              className={`dash-panel-title ${activeTab === 'ignorados' ? 'active' : ''}`}
              style={{ margin: 0, cursor: 'pointer', color: activeTab === 'ignorados' ? 'var(--text-primary)' : 'var(--text-muted)' }}
              onClick={() => setActiveTab('ignorados')}
            >
              <X size={18} /> 
              Ignorados
              <span className="badge-count" style={{ marginLeft: 8 }}>{leadsIgnorados.length}</span>
            </h3>
          </div>
          <p className="text-muted" style={{ fontSize: 13, marginTop: 12 }}>
            Clique em um lead para atualizar o status dele rapidamente ou acessar o painel de detalhes.
          </p>
        </div>
        
        {(activeTab === 'andamento' ? leadsAndamento : activeTab === 'fechados' ? leadsFechados : leadsIgnorados).length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Nenhum lead nesta lista.
          </div>
        ) : (
          <div className="table-container" style={{ borderRadius: 0, border: 'none', borderTop: 'none', height: 500, overflowY: 'auto' }}>
            <table className="leads-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>Empresa</th>
                  <th>Categoria</th>
                  <th>Avaliacao</th>
                  <th>Telefone</th>
                  <th>Score</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(activeTab === 'andamento' ? leadsAndamento : activeTab === 'fechados' ? leadsFechados : leadsIgnorados).map(lead => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    selected={selectedLead?.id === lead.id}
                    checked={false}
                    onCheck={() => {}}
                    onClick={activeTab === 'fechados' ? setLeadFechado : setSelectedLead}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL DE STATUS — apenas para leads em andamento/ignorados */}
      {selectedLead && activeTab !== 'fechados' && (
        <div className="status-modal-overlay" onClick={() => setSelectedLead(null)}>
          <div className="status-modal-content" onClick={e => e.stopPropagation()}>
            <button className="status-modal-close" onClick={() => setSelectedLead(null)}><X size={18} /></button>
            <h3>Atualizar Status</h3>
            <p className="text-muted" style={{ marginBottom: 20 }}>
              Lead: <strong>{selectedLead.empresa}</strong>
            </p>
            
            <div className="status-modal-grid">
              {['contatado', 'respondeu', 'qualificado', 'fechado', 'ignorado'].map(st => (
                <button 
                  key={st}
                  className={`status-btn ${selectedLead.status === st ? 'active' : ''}`}
                  onClick={() => handleMudarStatus(st)}
                  disabled={salvandoStatus}
                >
                  {st.charAt(0).toUpperCase() + st.slice(1)}
                </button>
              ))}
            </div>
            {salvandoStatus && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--accent-blue)' }}>Salvando...</div>}
          </div>
        </div>
      )}

      {/* MODAL DE FECHAMENTO — apenas para leads na aba Finalizados */}
      {leadFechado && (
        <LeadFechadoModal
          lead={leadFechado}
          onClose={() => setLeadFechado(null)}
          onSaved={carregarDados}
        />
      )}
    </div>
  );
}

