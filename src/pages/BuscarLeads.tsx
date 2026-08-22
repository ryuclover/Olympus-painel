import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search, SlidersHorizontal, Download, ChevronDown,
  MapPin, Loader2, AlertCircle, CheckCircle2, Grid, Map as MapIcon
} from "lucide-react";
import { LeadRow } from "../components/leads/LeadRow";
import { LeadDetailPanel } from "../components/leads/LeadDetailPanel";
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
    status: (a.status as Lead["status"]) ?? "frio",
    etapa: "novo",
    endereco: a.endereco ?? "",
    cidade: a.cidade ?? "",
    estado: a.estado ?? "",
    site: a.site || undefined,
    enriquecimento: {
      instagram: false,
      email: false,
      site: !!a.site && a.site_status === "ok",
      whatsappBusiness: false,
    },
    avaliacaoDistribuicao: [5,4,3,2,1].map(e => ({ estrelas: e, quantidade: 0 })),
    tags: a.tags ? a.tags.split(",").filter(Boolean) : [],
    lat: a.lat ?? 0,
    lng: a.lng ?? 0,
  };
}

export function BuscarLeads() {
  const [categoria, setCategoria] = useState("");
  const [localizacao, setLocalizacao] = useState("");
  const [raio, setRaio] = useState(20);
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const [showSugestoes, setShowSugestoes] = useState(false);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const [status, setStatus] = useState<BuscaStatus | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [localizacaoResolvida, setLocalizacaoResolvida] = useState("");

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const catInputRef = useRef<HTMLDivElement>(null);

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

  const carregarLeads = useCallback(async () => {
    try {
      const resp = await fetch("/api/leads?limit=100");
      const data = await resp.json();
      setLeads((data.leads ?? []).map(apiLeadToLead));
      setTotalLeads(data.total ?? 0);
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
          await carregarLeads();
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
    // if (!categoria.trim()) { setErro("Digite uma categoria para buscar"); return; }
    if (!localizacao.trim()) { setErro("Digite uma localizacao ou CEP"); return; }
    setErro(null);
    setStatus({ rodando: true, progresso: 0, total: 0, mensagem: "Iniciando...", erro: null });

    try {
      const resp = await fetch("/api/buscar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoria, localizacao, raio_km: raio }),
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

  const progPercent = status && status.total > 0
    ? Math.round((status.progresso / status.total) * 100)
    : status?.rodando ? null : null;

  return (
    <div className="buscar-page">
      {/* FILTROS */}
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

        {/* Botao */}
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
          <button className="view-tab"><MapIcon size={14} /><span>Mapa</span></button>
          <button className="view-tab"><Grid size={14} /><span>Kanban</span></button>
          <button className="view-tab view-tab-active"><SlidersHorizontal size={14} /><span>Painel</span></button>
        </div>

        {/* Filtros avancados */}
        <div className="advanced-filters">
          <div className="filter-group">
            <label>Avaliacao minima</label>
            <div className="select-wrapper">
              <select>
                <option>Qualquer</option>
                <option>3.0+</option>
                <option>4.0+</option>
                <option>4.5+</option>
              </select>
              <ChevronDown size={14} className="select-icon" />
            </div>
          </div>
          <div className="filter-toggle">
            <span>Apenas com telefone</span>
            <label className="toggle-switch">
              <input type="checkbox" defaultChecked />
              <span className="toggle-thumb" />
            </label>
          </div>
          <div className="filter-toggle">
            <span>Incluir quem tem site</span>
            <label className="toggle-switch">
              <input type="checkbox" />
              <span className="toggle-thumb" />
            </label>
          </div>
        </div>
      </aside>

      {/* RESULTADOS */}
      <section className="results-panel">
        <header className="results-header">
          <h3>
            <strong>{totalLeads}</strong> leads encontrados{" "}
            <span className="text-muted">(sem site ou site ruim)</span>
          </h3>
          <div className="results-actions">
            <button className="btn-outline"><Download size={14} /> Exportar</button>
            <button className="btn-outline"><SlidersHorizontal size={14} /> Filtros</button>
          </div>
        </header>

        {leads.length === 0 && !status?.rodando && (
          <div className="empty-state">
            <Search size={48} opacity={0.2} />
            <p>Nenhum lead ainda.</p>
            <p className="text-muted">Preencha a categoria e localizacao e clique em Buscar leads.</p>
          </div>
        )}

        {leads.length > 0 && (
          <div className="table-container">
            <table className="leads-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}><input type="checkbox" /></th>
                  <th>Empresa</th>
                  <th>Categoria</th>
                  <th>Avaliacao</th>
                  <th>Telefone</th>
                  <th>Score</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {leads.map(lead => (
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
      <LeadDetailPanel lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
}
