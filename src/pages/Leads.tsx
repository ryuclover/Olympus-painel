import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Users,
  MessageSquare,
  Building2,
  TrendingUp,
  Sparkles,
  Phone,
  Star,
  RotateCcw,
  Check
} from "lucide-react";
import type { Lead } from "../data/leads.mock";
import { ScoreBadge } from "../components/leads/ScoreBadge";
import { LeadDetailPanel } from "../components/leads/LeadDetailPanel";
import { fetchJson } from "../lib/api";
import "./Leads.css";

interface ApiLead {
  [key: string]: unknown;
}

// Função para mapear o formato da API para o formato do Frontend
function apiLeadToLead(a: any): Lead {
  return {
    id: a.place_id,
    empresa: a.nome,
    categoria: a.categoria,
    avaliacao: a.avaliacao ?? 0,
    totalAvaliacoes: a.total_avaliacoes ?? 0,
    telefone: a.telefone ?? "",
    score: a.score ?? 0,
    status: a.status ?? "novo",
    etapa: "novo",
    endereco: a.endereco ?? "",
    cidade: a.cidade ?? "",
    estado: a.estado ?? "",
    site: a.site || undefined,
    valorFechado: a.valor_fechado ?? 0,
    enriquecimento: {
      instagram: !!a.instagram_url,
      email: false,
      site: !!a.site && a.site_status === "ok",
      whatsappBusiness: false,
    },
    avaliacaoDistribuicao: [5, 4, 3, 2, 1].map(e => ({ estrelas: e, quantidade: 0 })),
    tags: a.tags ? a.tags.split(",").filter(Boolean) : [],
    lat: a.lat ?? 0,
    lng: a.lng ?? 0,
    observacao: a.observacoes || a.observacao,
    tipoTelefone: a.tipo_telefone,
    temWhatsapp: Boolean(a.tem_whatsapp)
  };
}

// Cache global para manter os leads carregados ao trocar de aba
let cacheLeads: Lead[] = [];
let cacheTotalLeads = 0;
let cachePaginaAtual = 1;
let cacheBuscaTexto = "";
let cacheStatusFiltro = "";
let cacheNichoFiltro = "";
let cacheWhatsappFiltro: "" | "com" | "sem" = "";

export function Leads() {
  const [leads, setLeads] = useState<Lead[]>(cacheLeads);
  const [totalLeads, setTotalLeads] = useState(cacheTotalLeads);
  const [loading, setLoading] = useState(cacheLeads.length === 0);
  const [erro, setErro] = useState<string | null>(null);

  // Paginação
  const [paginaAtual, setPaginaAtual] = useState(cachePaginaAtual);
  const [limitePorPagina, setLimitePorPagina] = useState(200);

  // Filtros
  const [buscaTexto, setBuscaTexto] = useState(cacheBuscaTexto);
  const [statusFiltro, setStatusFiltro] = useState(cacheStatusFiltro);
  const [nichoFiltro, setNichoFiltro] = useState(cacheNichoFiltro);
  const [whatsappFiltro, setWhatsappFiltro] = useState<"" | "com" | "sem">(cacheWhatsappFiltro);
  const [nichosDisponiveis, setNichosDisponiveis] = useState<string[]>([]);

  // Métricas Globais do Banco
  const [metricasGlobais, setMetricasGlobais] = useState<{
    total: number;
    comWpp: number;
    nichos: number;
    emProspeccao: number;
  }>({ total: 0, comWpp: 0, nichos: 0, emProspeccao: 0 });

  // Seleção e Detalhe
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [exportadoFeedback, setExportadoFeedback] = useState(false);

  const carregarLeads = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const offset = (paginaAtual - 1) * limitePorPagina;
      const params = new URLSearchParams({
        limit: String(limitePorPagina),
        offset: String(offset)
      });

      if (buscaTexto.trim()) params.set("busca", buscaTexto.trim());
      if (statusFiltro) params.set("status", statusFiltro);
      if (nichoFiltro) params.set("nicho", nichoFiltro);
      if (whatsappFiltro) params.set("whatsapp", whatsappFiltro);

      const data = await fetchJson<{ leads?: ApiLead[]; total?: number }>(`/api/leads?${params}`);

      const lista = (data.leads ?? []).map(apiLeadToLead);
      setLeads(lista);
      setTotalLeads(data.total ?? lista.length);
      
      // Atualiza o cache global
      cacheLeads = lista;
      cacheTotalLeads = data.total ?? lista.length;
      cachePaginaAtual = paginaAtual;
      cacheBuscaTexto = buscaTexto;
      cacheStatusFiltro = statusFiltro;
      cacheNichoFiltro = nichoFiltro;
      cacheWhatsappFiltro = whatsappFiltro;
      
    } catch (e: any) {
      console.error("Erro ao carregar leads:", e);
      setErro("Não foi possível carregar a lista de leads: " + (e.message || String(e)));
    } finally {
      setLoading(false);
    }
  }, [paginaAtual, limitePorPagina, buscaTexto, statusFiltro, nichoFiltro, whatsappFiltro]);

  // Carregar Nichos e Métricas Gerais
  const carregarDadosIniciais = useCallback(async () => {
    try {
      const [resNichos, resMetrics] = await Promise.all([
        fetchJson<string[]>("/api/nichos"),
        fetchJson<any>("/api/dashboard/metrics").catch(() => null)
      ]);
      setNichosDisponiveis(resNichos || []);
      if (resMetrics) {
        setMetricasGlobais({
          total: resMetrics.total_leads || 0,
          comWpp: resMetrics.funil?.com_whatsapp || 0,
          nichos: (resMetrics.nichos || []).length,
          emProspeccao: (resMetrics.funil?.contatado || 0) + (resMetrics.funil?.respondeu || 0) + (resMetrics.funil?.qualificado || 0)
        });
      }
    } catch {
      // silencioso
    }
  }, []);

  const isInitialMount = useRef(true);

  useEffect(() => {
    carregarDadosIniciais();
  }, [carregarDadosIniciais]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (cacheLeads.length === 0) {
        carregarLeads();
      }
      return;
    }
    carregarLeads();
  }, [carregarLeads]);

  // Auto-refresh inteligente: fica verificando se tem novos leads,
  // mas se estiver ocorrendo uma busca (scraper rodando), ele dá uma pausa para não pesar o banco.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const s = await fetchJson<{ rodando?: boolean }>("/api/buscar/status");
        
        // Se a busca estiver rodando, nós pausamos o "carregamento aos pouquinhos" nesta aba
        if (s.rodando) return;
        
        // Se não estiver rodando, verificamos se o total mudou
        const m = await fetchJson<any>("/api/dashboard/metrics");
        if (m && m.total_leads !== totalLeads) {
          carregarDadosIniciais();
          carregarLeads();
        }
      } catch (e) {
        // erro silencioso de polling
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [totalLeads, carregarDadosIniciais, carregarLeads]);

  // Resetar para página 1 quando alterar filtros
  const handleFiltroChange = (setter: (val: any) => void, val: any) => {
    setter(val);
    setPaginaAtual(1);
  };

  const totalPaginas = Math.max(1, Math.ceil(totalLeads / limitePorPagina));

  const handleCheck = (id: string) => {
    const n = new Set(checkedIds);
    n.has(id) ? n.delete(id) : n.add(id);
    setCheckedIds(n);
  };

  const todosSelecionados = leads.length > 0 && checkedIds.size === leads.length;
  const alternarSelecionarTodos = () => {
    if (todosSelecionados) setCheckedIds(new Set());
    else setCheckedIds(new Set(leads.map(l => l.id)));
  };

  const handleLeadUpdate = (updated: Lead) => {
    setSelectedLead(updated);
    setLeads(prev => prev.map(l => (l.id === updated.id ? updated : l)));
  };

  const limparFiltros = () => {
    setBuscaTexto("");
    setStatusFiltro("");
    setNichoFiltro("");
    setWhatsappFiltro("");
    setPaginaAtual(1);
  };

  const exportarCSV = () => {
    const leadsParaExportar = checkedIds.size > 0
      ? leads.filter(l => checkedIds.has(l.id))
      : leads;

    if (leadsParaExportar.length === 0) return;

    const headers = ["Empresa", "Categoria", "Telefone", "Tem WhatsApp", "Avaliacao", "Total Avaliacoes", "Score", "Status", "Endereco", "Site"];
    const rows = leadsParaExportar.map(l => [
      `"${(l.empresa || "").replace(/"/g, '""')}"`,
      `"${(l.categoria || "").replace(/"/g, '""')}"`,
      `"${l.telefone || ""}"`,
      l.temWhatsapp ? "Sim" : "Nao",
      l.avaliacao,
      l.totalAvaliacoes,
      l.score,
      l.status,
      `"${(l.endereco || "").replace(/"/g, '""')}"`,
      `"${l.site || ""}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `leads_olympus_pag${paginaAtual}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setExportadoFeedback(true);
    setTimeout(() => setExportadoFeedback(false), 3000);
  };

  // Faixa de itens exibidos
  const inicioItem = totalLeads === 0 ? 0 : (paginaAtual - 1) * limitePorPagina + 1;
  const fimItem = Math.min(paginaAtual * limitePorPagina, totalLeads);

  return (
    <div className="leads-page">
      <div className="leads-main-content">
        {/* HEADER */}
        <header className="leads-header">
          <div className="leads-header-title">
            <h1>
              <Users size={26} color="#3b82f6" /> Base de Leads
            </h1>
            <p>Histórico completo e unificado de prospecção sem duplicatas.</p>
          </div>
          <div className="leads-header-actions">
            <button
              className="btn-secondary-action"
              onClick={limparFiltros}
              title="Restaurar todos os filtros"
            >
              <RotateCcw size={14} /> Limpar
            </button>
            <button
              className="btn-primary-action"
              onClick={exportarCSV}
              disabled={leads.length === 0}
            >
              {exportadoFeedback ? (
                <>
                  <Check size={14} /> Exportado!
                </>
              ) : (
                <>
                  <Download size={14} /> Exportar CSV {checkedIds.size > 0 ? `(${checkedIds.size})` : ""}
                </>
              )}
            </button>
          </div>
        </header>

        {/* METRICS CARDS BANNER */}
        <section className="leads-stats-grid">
          <div className="leads-stat-card">
            <div className="leads-stat-icon blue">
              <Users size={20} />
            </div>
            <div className="leads-stat-data">
              <span className="leads-stat-label">Total no Banco</span>
              <span className="leads-stat-value">{totalLeads || metricasGlobais.total}</span>
            </div>
          </div>

          <div className="leads-stat-card">
            <div className="leads-stat-icon green">
              <MessageSquare size={20} />
            </div>
            <div className="leads-stat-data">
              <span className="leads-stat-label">Nesta Página (WPP)</span>
              <span className="leads-stat-value">{leads.filter(l => l.temWhatsapp).length}</span>
            </div>
          </div>

          <div className="leads-stat-card">
            <div className="leads-stat-icon purple">
              <Building2 size={20} />
            </div>
            <div className="leads-stat-data">
              <span className="leads-stat-label">Nichos Catalogados</span>
              <span className="leads-stat-value">{nichosDisponiveis.length || metricasGlobais.nichos}</span>
            </div>
          </div>

          <div className="leads-stat-card">
            <div className="leads-stat-icon orange">
              <TrendingUp size={20} />
            </div>
            <div className="leads-stat-data">
              <span className="leads-stat-label">Página Atual</span>
              <span className="leads-stat-value">{paginaAtual} / {totalPaginas}</span>
            </div>
          </div>
        </section>

        {/* FILTER BAR */}
        <section className="leads-filter-bar">
          {erro && (
            <div style={{ padding: "10px", background: "#fee2e2", color: "#dc2626", borderRadius: "8px", marginBottom: "15px", fontSize: "0.9rem" }}>
              {erro}
            </div>
          )}
          <div className="leads-filter-top-row">
            {/* Campo de Busca */}
            <div className="leads-search-input-wrapper">
              <Search size={16} className="leads-search-icon" />
              <input
                type="text"
                className="leads-search-input"
                placeholder="Buscar por nome, endereço ou telefone..."
                value={buscaTexto}
                onChange={e => handleFiltroChange(setBuscaTexto, e.target.value)}
                onKeyDown={e => e.key === "Enter" && carregarLeads()}
              />
            </div>

            {/* Filtro Status */}
            <div className="leads-filter-select-wrapper">
              <select
                className="leads-select"
                value={statusFiltro}
                onChange={e => handleFiltroChange(setStatusFiltro, e.target.value)}
              >
                <option value="">Todos os Status</option>
                <option value="novo">Novo</option>
                <option value="contatado">Contatado</option>
                <option value="respondeu">Respondeu</option>
                <option value="reuniao_agendada">Reunião Agendada</option>
                <option value="proposta_enviada">Proposta Enviada</option>
                <option value="fechado">Fechado</option>
                <option value="ignorado">Ignorado</option>
              </select>
              <ChevronDown size={14} className="leads-select-icon" />
            </div>

            {/* Filtro Nicho */}
            <div className="leads-filter-select-wrapper">
              <select
                className="leads-select"
                value={nichoFiltro}
                onChange={e => handleFiltroChange(setNichoFiltro, e.target.value)}
              >
                <option value="">Todos os Nichos</option>
                {nichosDisponiveis.map(n => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="leads-select-icon" />
            </div>

            {/* Controles Segmentados de WhatsApp */}
            <div className="leads-whatsapp-segmented">
              <button
                type="button"
                className={`leads-segment-btn ${whatsappFiltro === "" ? "active-all" : ""}`}
                onClick={() => handleFiltroChange(setWhatsappFiltro, "")}
              >
                Todos
              </button>
              <button
                type="button"
                className={`leads-segment-btn ${whatsappFiltro === "com" ? "active" : ""}`}
                onClick={() => handleFiltroChange(setWhatsappFiltro, "com")}
                title="Filtrar apenas leads com WhatsApp verificado"
              >
                <MessageSquare size={13} />
                Com WhatsApp
              </button>
              <button
                type="button"
                className={`leads-segment-btn ${whatsappFiltro === "sem" ? "active-without" : ""}`}
                onClick={() => handleFiltroChange(setWhatsappFiltro, "sem")}
                title="Filtrar telefones fixos ou sem WhatsApp"
              >
                <Phone size={13} />
                Sem WhatsApp
              </button>
            </div>
          </div>
        </section>

        {/* TOOLBAR INFORMATIVA */}
        <div className="leads-toolbar">
          <div className="leads-toolbar-left">
            <span>
              Exibindo <strong style={{ color: "#ffffff" }}>{inicioItem}-{fimItem}</strong> de <strong style={{ color: "#ffffff" }}>{totalLeads}</strong> leads encontrados
            </span>
            {checkedIds.size > 0 && (
              <span className="leads-count-badge">
                {checkedIds.size} selecionado(s)
              </span>
            )}
          </div>
          <div className="leads-toolbar-right">
            <span>Leads por página:</span>
            <select
              className="per-page-select"
              value={limitePorPagina}
              onChange={e => {
                setLimitePorPagina(Number(e.target.value));
                setPaginaAtual(1);
              }}
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </div>
        </div>

        {/* TABELA DE LEADS */}
        <section className="leads-table-card">
          {loading ? (
            <div className="leads-empty-state">
              <Sparkles size={32} className="spin" color="#3b82f6" />
              <h3>Carregando leads...</h3>
            </div>
          ) : leads.length === 0 ? (
            <div className="leads-empty-state">
              <div className="leads-empty-icon">
                <Search size={28} />
              </div>
              <h3>Nenhum lead encontrado</h3>
              <p>
                Tente ajustar os filtros de busca ou faça uma nova varredura na aba "Buscar Leads".
              </p>
              <button className="btn-secondary-action" onClick={limparFiltros} style={{ marginTop: 8 }}>
                Limpar filtros
              </button>
            </div>
          ) : (
            <div className="leads-table-scroll">
              <table className="custom-leads-table">
                <thead>
                  <tr>
                    <th style={{ width: 44, textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={todosSelecionados}
                        onChange={alternarSelecionarTodos}
                        title={todosSelecionados ? "Desmarcar todos" : "Selecionar todos"}
                        style={{ cursor: "pointer" }}
                      />
                    </th>
                    <th>Empresa & Local</th>
                    <th>Categoria</th>
                    <th>Avaliação</th>
                    <th>Telefone & WhatsApp</th>
                    <th>Score</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map(lead => {
                    const isSelected = selectedLead?.id === lead.id;
                    const isChecked = checkedIds.has(lead.id);

                    return (
                      <tr
                        key={lead.id}
                        className={`${isSelected ? "row-selected" : ""}`}
                        onClick={() => setSelectedLead(lead)}
                      >
                        <td
                          style={{ textAlign: "center" }}
                          onClick={e => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleCheck(lead.id)}
                            style={{ cursor: "pointer" }}
                          />
                        </td>
                        <td>
                          <div className="lead-name-box">
                            <span className="lead-name-title">{lead.empresa}</span>
                            {lead.endereco && (
                              <span className="lead-name-address" title={lead.endereco}>
                                {lead.endereco}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="lead-category-badge">
                            {lead.categoria || "Geral"}
                          </span>
                        </td>
                        <td>
                          <div className="lead-rating-badge">
                            <Star size={12} fill="#fbbf24" stroke="#fbbf24" />
                            <span>{lead.avaliacao.toFixed(1)}</span>
                            <span style={{ opacity: 0.6, fontSize: "11px" }}>
                              ({lead.totalAvaliacoes})
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="lead-phone-cell">
                            <span>{lead.telefone || "Sem telefone"}</span>
                            {lead.temWhatsapp ? (
                              <span className="wpp-pill">WHATSAPP</span>
                            ) : lead.tipoTelefone === "fixo" ? (
                              <span className="fixo-pill">FIXO</span>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <span
                            style={{
                              background: "rgba(255, 255, 255, 0.05)",
                              border: "1px solid var(--border, #2a3350)",
                              padding: "3px 8px",
                              borderRadius: "12px",
                              fontWeight: 700,
                              fontSize: "12px",
                              color: lead.score >= 60 ? "#22c55e" : lead.score >= 40 ? "#f59e0b" : "#8892aa"
                            }}
                          >
                            {lead.score}
                          </span>
                        </td>
                        <td>
                          <ScoreBadge status={lead.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* BARRA DE PAGINAÇÃO */}
          {!loading && totalLeads > 0 && (
            <div className="leads-pagination-bar">
              <div className="pagination-info">
                Página <strong>{paginaAtual}</strong> de <strong>{totalPaginas}</strong> (Total: <strong>{totalLeads}</strong> leads)
              </div>

              <div className="pagination-controls">
                <button
                  className="pagination-btn"
                  onClick={() => setPaginaAtual(1)}
                  disabled={paginaAtual === 1}
                  title="Primeira página"
                >
                  <ChevronsLeft size={16} />
                </button>
                <button
                  className="pagination-btn"
                  onClick={() => setPaginaAtual(prev => Math.max(1, prev - 1))}
                  disabled={paginaAtual === 1}
                  title="Página anterior"
                >
                  <ChevronLeft size={16} />
                </button>

                {/* Botões numéricos de páginas */}
                {(() => {
                  const pages: number[] = [];
                  const maxButtons = 5;
                  let start = Math.max(1, paginaAtual - Math.floor(maxButtons / 2));
                  let end = start + maxButtons - 1;
                  if (end > totalPaginas) {
                    end = totalPaginas;
                    start = Math.max(1, end - maxButtons + 1);
                  }
                  for (let i = start; i <= end; i++) {
                    pages.push(i);
                  }
                  return pages.map(pageNum => (
                    <button
                      key={pageNum}
                      className={`pagination-btn ${paginaAtual === pageNum ? "active" : ""}`}
                      onClick={() => setPaginaAtual(pageNum)}
                    >
                      {pageNum}
                    </button>
                  ));
                })()}

                <button
                  className="pagination-btn"
                  onClick={() => setPaginaAtual(prev => Math.min(totalPaginas, prev + 1))}
                  disabled={paginaAtual === totalPaginas}
                  title="Próxima página"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  className="pagination-btn"
                  onClick={() => setPaginaAtual(totalPaginas)}
                  disabled={paginaAtual === totalPaginas}
                  title="Última página"
                >
                  <ChevronsRight size={16} />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* PAINEL LATERAL DE DETALHES DO LEAD */}
      <LeadDetailPanel
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onLeadUpdate={handleLeadUpdate}
      />
    </div>
  );
}
