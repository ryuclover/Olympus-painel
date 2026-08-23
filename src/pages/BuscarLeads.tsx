import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Search, SlidersHorizontal, Download, ChevronDown,
  MapPin, Loader2, AlertCircle, CheckCircle2, Grid, Map as MapIcon,
  X, Filter, Check, Send
} from "lucide-react";
import { LeadRow } from "../components/leads/LeadRow";
import { LeadDetailPanel } from "../components/leads/LeadDetailPanel";
import { LeadMap } from "../components/leads/LeadMap";
import { KanbanBoard } from "../components/leads/KanbanBoard";
import type { Lead } from "../data/leads.mock";

const CATEGORIAS_SUGERIDAS = [
  "Clinica medica", "Odontologia", "Fisioterapia", "Psicologia",
  "Academia", "Restaurante", "Padaria", "Farmacia", "Pet shop",
  "Mecanica", "Eletricista", "Advocacia", "Contabilidade", "Imobiliaria",
];

interface BuscaStatus {
  rodando: boolean;
  progresso: number;
  total: number;
  mensagem: string;
  erro: string | null;
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
  foto_url?: string;
  tipo_telefone?: string;
  tem_whatsapp?: number;
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
    enriquecimento: {
      instagram: false,
      email: false,
      site: !!a.site && a.site_status === "ok",
      whatsappBusiness: Boolean(a.tem_whatsapp),
    },
    avaliacaoDistribuicao: [5,4,3,2,1].map(e => ({ estrelas: e, quantidade: 0 })),
    tags: a.tags ? a.tags.split(",").filter(Boolean) : [],
    lat: a.lat ?? 0,
    lng: a.lng ?? 0,
    fotoUrl: a.foto_url,
    tipoTelefone: a.tipo_telefone,
    temWhatsapp: Boolean(a.tem_whatsapp),
    observacao: a.observacoes,
  };
}

export function BuscarLeads() {
  const [categoria, setCategoria] = useState("");
  const [localizacao, setLocalizacao] = useState("");
  const [raio, setRaio] = useState(20);
  const [buscaRapida, setBuscaRapida] = useState(true);
  const [buscaSuperRapida, setBuscaSuperRapida] = useState(false);
  const [ignorarFixos, setIgnorarFixos] = useState(false);
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const [showSugestoes, setShowSugestoes] = useState(false);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"painel" | "mapa" | "kanban">("painel");


  // Filtros avançados
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroApenasTelefone, setFiltroApenasTelefone] = useState(false);
  const [filtroApenasWhatsapp, setFiltroApenasWhatsapp] = useState(false);
  const [filtroOcultarContatados, setFiltroOcultarContatados] = useState(false);
  const [filtroSite, setFiltroSite] = useState("todos");
  const [filtroNotaMin, setFiltroNotaMin] = useState(0);
  const [filtroScoreMin, setFiltroScoreMin] = useState(0);
  const [showFiltrosModal, setShowFiltrosModal] = useState(false);
  const [exportadoFeedback, setExportadoFeedback] = useState(false);

  const [status, setStatus] = useState<BuscaStatus | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [localizacaoResolvida, setLocalizacaoResolvida] = useState("");
  const [centerLat, setCenterLat] = useState<number | undefined>(undefined);
  const [centerLng, setCenterLng] = useState<number | undefined>(undefined);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const catInputRef = useRef<HTMLDivElement>(null);
  const buscaTimestampRef = useRef<string | null>(null); // timestamp de início da busca atual

  // Sugestoes de categoria
  useEffect(() => {
    if (!categoria.trim()) { setSugestoes([]); return; }
    const q = categoria.toLowerCase();
    setSugestoes(
      CATEGORIAS_SUGERIDAS.filter(c => c.toLowerCase().includes(q)).slice(0, 5)
    );
  }, [categoria]);

  // Fecha sugestoes ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (catInputRef.current && !catInputRef.current.contains(e.target as Node)) {
        setShowSugestoes(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const carregarLeads = useCallback(async (desde?: string) => {
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (desde) params.set("desde", desde);
      const resp = await fetch(`/api/leads?${params}`);
      const data = await resp.json();
      const lista = (data.leads ?? []).map(apiLeadToLead);
      setLeads(lista);
      setTotalLeads(data.total ?? lista.length);
    } catch {
      // silencioso
    }
  }, []);

  // Polling de status
  const iniciarPolling = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const resp = await fetch("/api/buscar/status");
        const s: BuscaStatus = await resp.json();
        setStatus(s);
        if (!s.rodando) {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          // Carrega apenas os leads novos desta busca (desde o timestamp que salvamos antes de iniciar)
          await carregarLeads(buscaTimestampRef.current ?? undefined);
        }
      } catch {
        clearInterval(pollingRef.current!);
      }
    }, 1500);
  };

  useEffect(() => {
    carregarLeads();
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [carregarLeads]);

  const handleBuscar = async () => {
    if (!localizacao.trim()) { setErro("Digite uma localizacao ou CEP"); return; }
    setErro(null);
    // Limpa os leads exibidos e selecionados antes de iniciar nova busca
    setLeads([]);
    setCheckedIds(new Set());
    setSelectedLead(null);
    // Grava o timestamp (menos 2s de margem para atualizado_em do SQLite)
    const agora = new Date(Date.now() - 2000).toISOString().replace('T', ' ').slice(0, 19);
    buscaTimestampRef.current = agora;
    setStatus({ rodando: true, progresso: 0, total: 0, mensagem: "Iniciando...", erro: null });

    // Geocodifica a localização para centrar o mapa no raio correto
    try {
      const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(localizacao)}&format=json&limit=1&countrycodes=br`;
      const geoRes = await fetch(geoUrl, { headers: { 'User-Agent': 'OlympusPainel/1.0' } });
      const geoData = await geoRes.json();
      if (geoData.length > 0) {
        setCenterLat(parseFloat(geoData[0].lat));
        setCenterLng(parseFloat(geoData[0].lon));
      }
    } catch { /* ignora erro de geocodificação */ }

    try {
      const resp = await fetch("/api/buscar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoria,
          localizacao,
          raio_km: raio,
          busca_rapida: buscaRapida,
          busca_super_rapida: buscaSuperRapida,
          ignorar_fixos: ignorarFixos,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) { setErro(data.erro || "Erro ao iniciar busca"); setStatus(null); return; }
      if (data.localizacao_resolvida) setLocalizacaoResolvida(data.localizacao_resolvida);
      iniciarPolling();
    } catch {
      setErro("Nao foi possivel conectar ao servidor. Verifique se o backend esta rodando.");
      setStatus(null);
    }
  };

  const handleCheck = (id: string) => {
    const n = new Set(checkedIds);
    n.has(id) ? n.delete(id) : n.add(id);
    setCheckedIds(n);
  };

  // Atualização de lead em tempo real pelo detalhe
  const handleLeadUpdate = (updated: Lead) => {
    setSelectedLead(updated);
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
  };

  // Filtragem dos leads em tempo real
  const leadsFiltrados = useMemo(() => {
    return leads.filter(l => {
      if (filtroTexto.trim()) {
        const q = filtroTexto.toLowerCase();
        const match =
          l.empresa.toLowerCase().includes(q) ||
          l.categoria.toLowerCase().includes(q) ||
          l.telefone.includes(q) ||
          l.endereco.toLowerCase().includes(q) ||
          l.cidade.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (filtroStatus !== "todos" && l.status?.toLowerCase() !== filtroStatus.toLowerCase()) {
        return false;
      }
      if (filtroApenasTelefone && (!l.telefone || l.telefone.trim() === "")) {
        return false;
      }
      if (filtroApenasWhatsapp && !l.temWhatsapp) {
        return false;
      }
      if (filtroSite === "sem_site" && l.site) {
        return false;
      }
      if (filtroSite === "com_site" && !l.site) {
        return false;
      }
      if (filtroNotaMin > 0 && l.avaliacao < filtroNotaMin) {
        return false;
      }
      if (filtroScoreMin > 0 && (l.score ?? 0) < filtroScoreMin) {
        return false;
      }
      if (filtroOcultarContatados && l.status && l.status !== "novo") {
        return false;
      }
      return true;
    });
  }, [leads, filtroTexto, filtroStatus, filtroApenasTelefone, filtroApenasWhatsapp, filtroOcultarContatados, filtroSite, filtroNotaMin, filtroScoreMin]);

  // Contagem de filtros ativos
  const totalFiltrosAtivos = useMemo(() => {
    return [
      filtroStatus !== "todos",
      filtroApenasTelefone,
      filtroApenasWhatsapp,
      filtroOcultarContatados,
      filtroSite !== "todos",
      filtroNotaMin > 0,
      filtroScoreMin > 0,
      filtroTexto.trim().length > 0,
    ].filter(Boolean).length;
  }, [filtroStatus, filtroApenasTelefone, filtroApenasWhatsapp, filtroOcultarContatados, filtroSite, filtroNotaMin, filtroScoreMin, filtroTexto]);

  const limparFiltros = () => {
    setFiltroTexto("");
    setFiltroStatus("todos");
    setFiltroApenasTelefone(false);
    setFiltroApenasWhatsapp(false);
    setFiltroOcultarContatados(false);
    setFiltroSite("todos");
    setFiltroNotaMin(0);
    setFiltroScoreMin(0);
  };

  // Selecionar todos os leads filtrados
  const todosSelecionados = leadsFiltrados.length > 0 && leadsFiltrados.every(l => checkedIds.has(l.id));
  const alternarSelecionarTodos = () => {
    if (todosSelecionados) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(leadsFiltrados.map(l => l.id)));
    }
  };

  // Exportar para CSV
  const handleExportar = () => {
    const alvos = checkedIds.size > 0
      ? leads.filter(l => checkedIds.has(l.id))
      : leadsFiltrados;

    if (alvos.length === 0) {
      alert("Nenhum lead disponível para exportar!");
      return;
    }

    const headers = [
      "Empresa", "Categoria", "Telefone", "Endereço", "Cidade",
      "Estado", "Avaliação", "Total Avaliações", "Score", "Status", "Site"
    ];

    const rows = alvos.map(l => [
      `"${(l.empresa || "").replace(/"/g, '""')}"`,
      `"${(l.categoria || "").replace(/"/g, '""')}"`,
      `"${(l.telefone || "").replace(/"/g, '""')}"`,
      `"${(l.endereco || "").replace(/"/g, '""')}"`,
      `"${(l.cidade || "").replace(/"/g, '""')}"`,
      `"${(l.estado || "").replace(/"/g, '""')}"`,
      l.avaliacao || 0,
      l.totalAvaliacoes || 0,
      l.score || 0,
      `"${l.status || "novo"}"`,
      `"${(l.site || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const dataStr = new Date().toISOString().split("T")[0];
    link.download = `leads_olympus_${checkedIds.size > 0 ? "selecionados_" : ""}${dataStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportadoFeedback(true);
    setTimeout(() => setExportadoFeedback(false), 3000);
  };

  const progPercent = status && status.total > 0
    ? Math.round((status.progresso / status.total) * 100)
    : status?.rodando ? null : null;

  return (
    <div className="buscar-page">
      {/* FILTROS LATERAL */}
      <aside className="filters-panel">
        <h2 className="filters-title">Buscar novos leads</h2>

        {/* Categoria com autocomplete */}
        <div className="filter-group" ref={catInputRef}>
          <label>Categoria / Nicho</label>
          <div style={{ position: "relative" }}>
            <div className="select-wrapper">
              <input
                type="text"
                placeholder="Ex: clinica medica, restaurante..."
                value={categoria}
                onChange={e => { setCategoria(e.target.value); setShowSugestoes(true); }}
                onFocus={() => setShowSugestoes(true)}
                autoComplete="off"
              />
              <Search size={14} className="select-icon" />
            </div>
            {showSugestoes && sugestoes.length > 0 && (
              <div className="autocomplete-dropdown">
                {sugestoes.map(s => (
                  <button key={s} className="autocomplete-item" onClick={() => { setCategoria(s); setShowSugestoes(false); }}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Localizacao */}
        <div className="filter-group">
          <label>Localizacao ou CEP</label>
          <div className="select-wrapper">
            <input
              type="text"
              placeholder="Ex: Porto Alegre, RS ou 90000-000"
              value={localizacao}
              onChange={e => setLocalizacao(e.target.value)}
            />
            <MapPin size={14} className="select-icon" />
          </div>
          {localizacaoResolvida && (
            <span className="loc-resolvida"><CheckCircle2 size={12} /> {localizacaoResolvida}</span>
          )}
        </div>

        {/* Raio */}
        <div className="filter-group">
          <label>Raio de busca: <strong>{raio} km</strong></label>
          <input
            type="range" min={1} max={100} value={raio}
            onChange={e => setRaio(Number(e.target.value))}
            className="range-slider"
          />
          <div className="range-labels"><span>1 km</span><span>100 km</span></div>
        </div>

        {/* Opções Avançadas de Busca */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "8px" }}>
          <div className="filter-toggle" style={{ padding: "4px 0" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 500 }}>⚡ Busca rápida (multi-abas)</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={buscaRapida}
                onChange={e => setBuscaRapida(e.target.checked)}
              />
              <span className="toggle-thumb" />
            </label>
          </div>
          <div className="filter-toggle" style={{ padding: "4px 0" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 500 }}>🚀 Busca SUPER Rápida</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={buscaSuperRapida}
                onChange={e => setBuscaSuperRapida(e.target.checked)}
              />
              <span className="toggle-thumb" />
            </label>
          </div>
          {buscaSuperRapida && (
            <div style={{ fontSize: "0.75rem", color: "var(--accent-red)", padding: "0 4px", marginTop: "-4px", marginBottom: "4px" }}>
              Aviso: isso pode lagar um pouco o seu computador.
            </div>
          )}
          <div className="filter-toggle" style={{ padding: "4px 0" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 500 }}>📱 Apenas WhatsApp (ignorar fixos)</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={ignorarFixos}
                onChange={e => setIgnorarFixos(e.target.checked)}
              />
              <span className="toggle-thumb" />
            </label>
          </div>
        </div>

        {/* Botao de Busca */}
        <button
          className="btn-search"
          onClick={handleBuscar}
          disabled={status?.rodando}
        >
          {status?.rodando
            ? <><Loader2 size={14} className="spin" /> Buscando...</>
            : <><Search size={14} /> Buscar leads</>
          }
        </button>

        {/* Erro */}
        {erro && (
          <div className="erro-box"><AlertCircle size={14} /> {erro}</div>
        )}

        {/* Progresso */}
        {status?.rodando && (
          <div className="progress-box">
            <p className="progress-msg">{status.mensagem}</p>
            {progPercent !== null && (
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progPercent}%` }} />
              </div>
            )}
            {progPercent !== null && (
              <span className="progress-pct">{progPercent}%</span>
            )}
          </div>
        )}

        {/* Concluido */}
        {status && !status.rodando && !status.erro && status.mensagem && (
          <div className="sucesso-box"><CheckCircle2 size={14} /> {status.mensagem}</div>
        )}

        {/* Erro da busca */}
        {status?.erro && (
          <div className="erro-box"><AlertCircle size={14} /> {status.erro}</div>
        )}

        {/* Tabs de visualizacao */}
        <div className="view-tabs">
          <button 
            className={`view-tab ${viewMode === "mapa" ? "view-tab-active" : ""}`}
            onClick={() => setViewMode("mapa")}
          >
            <MapIcon size={14} /><span>Mapa</span>
          </button>
          <button 
            className={`view-tab ${viewMode === "kanban" ? "view-tab-active" : ""}`}
            onClick={() => setViewMode("kanban")}
          >
            <Grid size={14} /><span>Kanban</span>
          </button>
          <button 
            className={`view-tab ${viewMode === "painel" ? "view-tab-active" : ""}`}
            onClick={() => setViewMode("painel")}
          >
            <SlidersHorizontal size={14} /><span>Painel</span>
          </button>
        </div>

        {/* Filtros rapidos no sidebar */}
        <div className="advanced-filters">
          <div className="filter-group">
            <label>Avaliacao minima</label>
            <div className="select-wrapper">
              <select value={filtroNotaMin} onChange={e => setFiltroNotaMin(Number(e.target.value))}>
                <option value={0}>Qualquer</option>
                <option value={3}>3.0+</option>
                <option value={4}>4.0+</option>
                <option value={4.5}>4.5+</option>
              </select>
              <ChevronDown size={14} className="select-icon" />
            </div>
          </div>
          <div className="filter-toggle">
            <span>Apenas com telefone</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={filtroApenasTelefone}
                onChange={e => setFiltroApenasTelefone(e.target.checked)}
              />
              <span className="toggle-thumb" />
            </label>
          </div>
          <div className="filter-toggle">
            <span>Apenas com WhatsApp</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={filtroApenasWhatsapp}
                onChange={e => setFiltroApenasWhatsapp(e.target.checked)}
              />
              <span className="toggle-thumb" />
            </label>
          </div>
          <div className="filter-toggle">
            <span>Apenas sem site</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={filtroSite === "sem_site"}
                onChange={e => setFiltroSite(e.target.checked ? "sem_site" : "todos")}
              />
              <span className="toggle-thumb" />
            </label>
          </div>
          <div className="filter-toggle">
            <span>Ocultar já contatados</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={filtroOcultarContatados}
                onChange={e => setFiltroOcultarContatados(e.target.checked)}
              />
              <span className="toggle-thumb" />
            </label>
          </div>
        </div>
      </aside>

      {/* RESULTADOS */}
      <section className="results-panel">
        <header className="results-header">
          <h3>
            <strong>{leadsFiltrados.length}</strong> de <strong>{totalLeads}</strong> leads encontrados{" "}
            {checkedIds.size > 0 && (
              <span style={{ color: "var(--accent-blue)", fontWeight: 600 }}>
                ({checkedIds.size} selecionado{checkedIds.size > 1 ? "s" : ""})
              </span>
            )}
            {totalFiltrosAtivos > 0 && (
              <span className="text-muted" style={{ marginLeft: 8, fontSize: 13 }}>
                • {totalFiltrosAtivos} filtro(s) ativo(s)
              </span>
            )}
          </h3>

          <div className="results-actions">
            {/* BOTÃO ENVIO EM MASSA */}
            {checkedIds.size > 0 && (
              <button
                className="btn-primary"
                onClick={() => alert("Em breve: Configuração para disparo automático no WhatsApp!")}
                title={`Enviar mensagem para ${checkedIds.size} leads`}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px" }}
              >
                <Send size={14} /> Envio Automático ({checkedIds.size})
              </button>
            )}

            {/* BOTÃO EXPORTAR */}
            <button
              className={`btn-outline ${exportadoFeedback ? "active" : ""}`}
              onClick={handleExportar}
              title={checkedIds.size > 0 ? `Exportar ${checkedIds.size} leads selecionados` : "Exportar leads para CSV"}
            >
              {exportadoFeedback ? (
                <><Check size={14} color="var(--accent-green)" /> Exportado!</>
              ) : (
                <><Download size={14} /> Exportar {checkedIds.size > 0 ? `(${checkedIds.size})` : ""}</>
              )}
            </button>

            {/* BOTÃO FILTROS */}
            <button
              className={`btn-outline ${totalFiltrosAtivos > 0 || showFiltrosModal ? "active" : ""}`}
              onClick={() => setShowFiltrosModal(!showFiltrosModal)}
            >
              <SlidersHorizontal size={14} />
              Filtros
              {totalFiltrosAtivos > 0 && (
                <span className="badge-count">{totalFiltrosAtivos}</span>
              )}
            </button>
          </div>
        </header>

        {/* FEEDBACK EXPORTAÇÃO */}
        {exportadoFeedback && (
          <div className="export-toast">
            <CheckCircle2 size={18} />
            Arquivo CSV baixado com sucesso!
          </div>
        )}

        {/* MODAL / DROPDOWN DE FILTROS */}
        {showFiltrosModal && (
          <div className="filtros-modal-overlay" onClick={() => setShowFiltrosModal(false)}>
            <div className="filtros-modal" onClick={e => e.stopPropagation()}>
              <div className="filtros-modal-header">
                <h4><Filter size={16} /> Filtros de Leads</h4>
                <button className="detail-close" onClick={() => setShowFiltrosModal(false)}>
                  <X size={16} />
                </button>
              </div>

              <div className="filtros-modal-body">
                {/* Busca rápida */}
                <div className="filter-group filtros-input-full">
                  <label>Buscar por texto (Nome, Categoria, Cidade, Telefone)</label>
                  <div className="select-wrapper">
                    <input
                      type="text"
                      placeholder="Filtrar por qualquer palavra..."
                      value={filtroTexto}
                      onChange={e => setFiltroTexto(e.target.value)}
                    />
                    {filtroTexto && (
                      <X
                        size={14}
                        style={{ position: "absolute", right: 12, cursor: "pointer" }}
                        onClick={() => setFiltroTexto("")}
                      />
                    )}
                  </div>
                </div>

                {/* Status / Temperatura */}
                <div className="filter-group filtros-input-full">
                  <label>Status do Lead</label>
                  <div className="filter-chip-group">
                    {["todos", "novo", "quente", "morno", "frio", "contatado", "qualificado", "fechado"].map(st => (
                      <button
                        key={st}
                        className={`filter-chip ${filtroStatus === st ? "active" : ""}`}
                        onClick={() => setFiltroStatus(st)}
                      >
                        {st.charAt(0).toUpperCase() + st.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Presença de Site */}
                <div className="filter-group">
                  <label>Website</label>
                  <div className="select-wrapper">
                    <select value={filtroSite} onChange={e => setFiltroSite(e.target.value)}>
                      <option value="todos">Todos os leads</option>
                      <option value="sem_site">Apenas SEM site</option>
                      <option value="com_site">Apenas COM site</option>
                    </select>
                    <ChevronDown size={14} className="select-icon" />
                  </div>
                </div>

                {/* Avaliação mínima */}
                <div className="filter-group">
                  <label>Avaliação Mínima (Estrelas)</label>
                  <div className="select-wrapper">
                    <select value={filtroNotaMin} onChange={e => setFiltroNotaMin(Number(e.target.value))}>
                      <option value={0}>Qualquer avaliação</option>
                      <option value={3}>⭐ 3.0+</option>
                      <option value={4}>⭐ 4.0+</option>
                      <option value={4.5}>⭐ 4.5+</option>
                    </select>
                    <ChevronDown size={14} className="select-icon" />
                  </div>
                </div>

                {/* Score mínimo */}
                <div className="filter-group">
                  <label>Score Mínimo</label>
                  <div className="select-wrapper">
                    <select value={filtroScoreMin} onChange={e => setFiltroScoreMin(Number(e.target.value))}>
                      <option value={0}>Qualquer score</option>
                      <option value={30}>30+ pontos</option>
                      <option value={50}>50+ pontos</option>
                      <option value={70}>70+ pontos</option>
                    </select>
                    <ChevronDown size={14} className="select-icon" />
                  </div>
                </div>

                {/* Apenas com telefone */}
                <div className="filter-group" style={{ justifyContent: "center" }}>
                  <label>Telefone</label>
                  <div className="filter-toggle" style={{ marginTop: 4 }}>
                    <span>Apenas com número</span>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={filtroApenasTelefone}
                        onChange={e => setFiltroApenasTelefone(e.target.checked)}
                      />
                      <span className="toggle-thumb" />
                    </label>
                  </div>
                </div>

                {/* Apenas com WhatsApp */}
                <div className="filter-group" style={{ justifyContent: "center" }}>
                  <label>WhatsApp</label>
                  <div className="filter-toggle" style={{ marginTop: 4 }}>
                    <span>Apenas com WhatsApp</span>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={filtroApenasWhatsapp}
                        onChange={e => setFiltroApenasWhatsapp(e.target.checked)}
                      />
                      <span className="toggle-thumb" />
                    </label>
                  </div>
                </div>
              </div>

              <div className="filtros-modal-footer">
                <button className="btn-limpar" onClick={limparFiltros}>
                  Limpar todos os filtros
                </button>
                <button className="btn-search" style={{ padding: "8px 16px" }} onClick={() => setShowFiltrosModal(false)}>
                  Ver {leadsFiltrados.length} leads
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ESTADO VAZIO */}
        {leadsFiltrados.length === 0 && !status?.rodando && (
          <div className="empty-state">
            <Search size={48} opacity={0.2} />
            <p>{leads.length === 0 ? "Nenhum lead encontrado ainda." : "Nenhum lead corresponde aos filtros ativos."}</p>
            {leads.length > 0 ? (
              <button className="btn-outline" onClick={limparFiltros} style={{ marginTop: 8 }}>
                Limpar filtros
              </button>
            ) : (
              <p className="text-muted">Preencha a categoria e localizacao e clique em Buscar leads.</p>
            )}
          </div>
        )}

        {/* LISTA DE LEADS OU MAPA */}
        {leadsFiltrados.length > 0 && viewMode === "mapa" && (
          <div style={{ flex: 1, minHeight: "500px", display: "flex", flexDirection: "column" }}>
            <LeadMap 
              leads={leadsFiltrados} 
              radiusKm={raio}
              centerLat={centerLat}
              centerLng={centerLng}
              onLeadClick={(lead) => setSelectedLead(lead)} 
            />
          </div>
        )}

        {leadsFiltrados.length > 0 && viewMode === "kanban" && (
          <div style={{ flex: 1, padding: "0 20px" }}>
            <KanbanBoard 
              leads={leadsFiltrados}
              onLeadClick={(lead) => setSelectedLead(lead)}
              onLeadUpdate={(leadAtualizado) => {
                setLeads(prev => prev.map(l => l.id === leadAtualizado.id ? leadAtualizado : l));
              }}
            />
          </div>
        )}

        {leadsFiltrados.length > 0 && viewMode === "painel" && (
          <div className="table-container">
            <table className="leads-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={todosSelecionados}
                      onChange={alternarSelecionarTodos}
                      title={todosSelecionados ? "Desmarcar todos" : "Selecionar todos"}
                    />
                  </th>
                  <th>Empresa</th>
                  <th>Categoria</th>
                  <th>Avaliacao</th>
                  <th>Telefone</th>
                  <th>Score</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {leadsFiltrados.map(lead => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    selected={selectedLead?.id === lead.id}
                    checked={checkedIds.has(lead.id)}
                    onCheck={handleCheck}
                    onClick={setSelectedLead}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* DETALHE */}
      <LeadDetailPanel
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onLeadUpdate={handleLeadUpdate}
      />
    </div>
  );
}
