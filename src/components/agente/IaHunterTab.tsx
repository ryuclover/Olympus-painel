import { useState, useEffect, useRef } from "react";
import {
  Globe, Sparkles, Play, Square, RefreshCw, ExternalLink, MessageSquare,
  Building2, MapPin, Phone, Copy, Check, ArrowRight
} from "lucide-react";
import { Link } from "react-router-dom";
import type { IaHunterStatus } from "./types";

interface IaHunterTabProps {
  nichoPadrao?: string;
  empresaNome?: string;
}

const PRESETS_SUGERIDOS = [
  { rotulo: "Odontologia & Implantes", nicho: "Clínicas Odontológicas e Implantes", cidade: "Campinas, SP" },
  { rotulo: "Estética & Harmonização", nicho: "Clínicas de Estética e Harmonização Facial", cidade: "Belo Horizonte, MG" },
  { rotulo: "Imobiliárias Alto Padrão", nicho: "Imobiliárias e Corretores de Alto Padrão", cidade: "São Paulo, SP" },
  { rotulo: "Energia Solar & Engenharia", nicho: "Empresas de Energia Solar e Projetos", cidade: "Curitiba, PR" },
  { rotulo: "Escritórios de Advocacia", nicho: "Escritórios de Advocacia e Consultoria Jurídica", cidade: "Rio de Janeiro, RJ" },
];

export function IaHunterTab({ nichoPadrao }: IaHunterTabProps) {
  const [nicho, setNicho] = useState(nichoPadrao || "");
  const [localizacao, setLocalizacao] = useState("São Paulo, SP");
  const [criterio, setCriterio] = useState("Empresas com WhatsApp e Instagram ativos para prospecção");
  const [maxLeads, setMaxLeads] = useState(10);
  const [salvarBanco, setSalvarBanco] = useState(true);

  const [status, setStatus] = useState<IaHunterStatus>({
    rodando: false,
    progresso: 0,
    etapa: "Pronto",
    mensagem: "Configure os filtros e inicie a prospecção autônoma com IA.",
    queries_executadas: [],
    total_web_encontrados: 0,
    total_leads_salvos: 0,
    leads: [],
    erro: null,
    cancelar: false,
  });

  const [iniciando, setIniciando] = useState(false);
  const [parando, setParando] = useState(false);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const pollingRef = useRef<any>(null);

  useEffect(() => {
    carregarStatus();
    iniciarPolling();
    return () => pararPolling();
  }, []);

  // Sincroniza nicho do guia se vazio
  useEffect(() => {
    if (nichoPadrao && !nicho) {
      setNicho(nichoPadrao);
    }
  }, [nichoPadrao]);

  const carregarStatus = async () => {
    try {
      const resp = await fetch("/api/ia-hunter/status");
      if (resp.ok) {
        const dados = await resp.json();
        setStatus(dados);
      }
    } catch (e) {
      console.error("Erro ao carregar status do IA Hunter:", e);
    }
  };

  const iniciarPolling = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const resp = await fetch("/api/ia-hunter/status");
        if (resp.ok) {
          const dados: IaHunterStatus = await resp.json();
          setStatus(dados);
        }
      } catch (err) {
        // silencioso
      }
    }, 2000);
  };

  const pararPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const dispararBusca = async () => {
    if (!nicho.trim()) {
      alert("Por favor, informe o nicho comercial para a IA prospectar.");
      return;
    }
    if (!localizacao.trim()) {
      alert("Por favor, informe a cidade ou localidade alvo.");
      return;
    }

    try {
      setIniciando(true);
      const resp = await fetch("/api/ia-hunter/iniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nicho: nicho.trim(),
          localizacao: localizacao.trim(),
          criterio: criterio.trim(),
          max_leads: maxLeads,
          salvar_banco: salvarBanco,
        }),
      });
      const dados = await resp.json();
      if (!resp.ok || !dados.ok) {
        alert(dados.erro || "Falha ao iniciar busca autônoma.");
      } else {
        await carregarStatus();
      }
    } catch (e: any) {
      alert("Erro ao conectar com o servidor: " + e.message);
    } finally {
      setIniciando(false);
    }
  };

  const pararBusca = async () => {
    try {
      setParando(true);
      await fetch("/api/ia-hunter/parar", { method: "POST" });
      await carregarStatus();
    } catch (e) {
      console.error("Erro ao parar busca:", e);
    } finally {
      setParando(false);
    }
  };

  const copiarPitch = (texto: string, id: string) => {
    navigator.clipboard.writeText(texto);
    setCopiadoId(id);
    setTimeout(() => setCopiadoId(null), 2500);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Banner Principal de Apresentação */}
      <div className="agente-card" style={{ borderLeft: "4px solid #6366f1" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(99, 102, 241, 0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Globe size={22} color="#818cf8" />
              </div>
              <div>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                  Caçador Autônomo de Leads Web (AI Hunter)
                </h2>
                <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  A IA pesquisa ativamente na internet, utiliza dorks estratégicos e minera contatos de WhatsApp, Instagram e sites reais.
                </span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 20,
              fontSize: "0.75rem",
              fontWeight: 600,
              background: status.rodando ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.05)",
              color: status.rodando ? "#34d399" : "var(--text-muted)",
              border: `1px solid ${status.rodando ? "#059669" : "rgba(255, 255, 255, 0.1)"}`
            }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: status.rodando ? "#10b981" : "#6b7280",
                animation: status.rodando ? "pulse 1.5s infinite" : "none"
              }} />
              {status.rodando ? "Varredura Ativa na Web" : "Pronto para Iniciar"}
            </span>
          </div>
        </div>

        {/* Presets Rápidos */}
        <div style={{ marginTop: 18, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
            ATALHOS RÁPIDOS DE SEGMENTOS:
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {nichoPadrao && (
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: "0.78rem", padding: "4px 10px", background: "rgba(99, 102, 241, 0.12)", borderColor: "#6366f1", color: "#a5b4fc" }}
                onClick={() => setNicho(nichoPadrao)}
              >
                <Sparkles size={13} style={{ marginRight: 4 }} />
                Nicho da Minha Empresa ({nichoPadrao.slice(0, 24)}...)
              </button>
            )}
            {PRESETS_SUGERIDOS.map((p) => (
              <button
                key={p.rotulo}
                type="button"
                className="btn-secondary"
                style={{ fontSize: "0.78rem", padding: "4px 10px" }}
                onClick={() => {
                  setNicho(p.nicho);
                  setLocalizacao(p.cidade);
                }}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
        </div>

        {/* Formulário de Configuração do AI Hunter */}
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, marginTop: 18 }}>
          <div className="form-group">
            <label className="form-label">
              <Building2 size={14} style={{ display: "inline", marginRight: 6 }} />
              Nicho Comercial / Tipo de Empresa Alvo
            </label>
            <input
              type="text"
              className="form-input"
              value={nicho}
              onChange={(e) => setNicho(e.target.value)}
              placeholder="Ex: Clínicas odontológicas, imobiliárias, barbearias..."
              disabled={status.rodando}
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              <MapPin size={14} style={{ display: "inline", marginRight: 6 }} />
              Cidade Alvo ou Região
            </label>
            <input
              type="text"
              className="form-input"
              value={localizacao}
              onChange={(e) => setLocalizacao(e.target.value)}
              placeholder="Ex: Campinas, SP ou Niterói, RJ ou Brasil"
              disabled={status.rodando}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 16 }}>
          <div className="form-group">
            <label className="form-label">
              <Sparkles size={14} style={{ display: "inline", marginRight: 6 }} />
              Critério Especial / Filtro de Qualificação da IA
            </label>
            <input
              type="text"
              className="form-input"
              value={criterio}
              onChange={(e) => setCriterio(e.target.value)}
              placeholder="Ex: Empresas com WhatsApp, que parecem não ter site ou precisam de automação"
              disabled={status.rodando}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Quantidade de Leads</label>
            <select
              className="form-input"
              value={maxLeads}
              onChange={(e) => setMaxLeads(Number(e.target.value))}
              disabled={status.rodando}
            >
              <option value={5}>5 Leads (Rápido - ~30s)</option>
              <option value={10}>10 Leads (Recomendado - ~60s)</option>
              <option value={15}>15 Leads (~90s)</option>
              <option value={20}>20 Leads (Completo)</option>
            </select>
          </div>

          <div className="form-group" style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={salvarBanco}
                onChange={(e) => setSalvarBanco(e.target.checked)}
                disabled={status.rodando}
              />
              <span>Salvar no CRM Leads</span>
            </label>
          </div>
        </div>

        {/* Botões de Ação */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
          {!status.rodando ? (
            <button
              className="btn-primary"
              onClick={dispararBusca}
              disabled={iniciando || !nicho.trim() || !localizacao.trim()}
              style={{ background: "#4f46e5", borderColor: "#6366f1" }}
            >
              <Play size={16} fill="currentColor" />
              {iniciando ? "Iniciando IA Hunter..." : "🚀 Iniciar Prospecção Web com IA"}
            </button>
          ) : (
            <button
              className="btn-secondary"
              onClick={pararBusca}
              disabled={parando}
              style={{ borderColor: "#ef4444", color: "#f87171" }}
            >
              <Square size={16} fill="currentColor" />
              {parando ? "Parando..." : "⏹️ Parar Prospecção"}
            </button>
          )}

          <button className="btn-secondary" onClick={carregarStatus} title="Atualizar status">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>

        {/* Barra de Progresso e Status em Tempo Real */}
        {(status.rodando || status.progresso > 0) && (
          <div style={{ marginTop: 20, padding: 16, borderRadius: 8, background: "rgba(15, 23, 42, 0.7)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>
                {status.etapa}
              </span>
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#818cf8" }}>
                {status.progresso}%
              </span>
            </div>

            {/* Barra */}
            <div style={{ width: "100%", height: 8, borderRadius: 4, background: "rgba(255, 255, 255, 0.08)", overflow: "hidden", marginBottom: 8 }}>
              <div
                style={{
                  width: `${status.progresso}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #4f46e5, #818cf8)",
                  transition: "width 0.4s ease",
                  boxShadow: "0 0 12px rgba(99, 102, 241, 0.5)",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              <span>{status.mensagem}</span>
              <span>
                <strong>{status.total_leads_salvos}</strong> leads qualificados salvos
              </span>
            </div>

            {/* Queries Dorks Executadas */}
            {status.queries_executadas && status.queries_executadas.length > 0 && (
              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Estratégias web:</span>
                {status.queries_executadas.map((q, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: "0.73rem",
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: "rgba(99, 102, 241, 0.1)",
                      border: "1px solid rgba(99, 102, 241, 0.2)",
                      color: "#c7d2fe",
                      fontFamily: "monospace",
                    }}
                  >
                    {q}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabela de Leads Qualificados Encontrados */}
      <div className="agente-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              Leads Encontrados & Qualificados pela IA ({status.leads?.length || 0})
            </h3>
            <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
              Empresas mineradas diretamente da internet com análise de oportunidade e pitch inicial customizado.
            </span>
          </div>

          <Link to="/leads" className="btn-secondary" style={{ fontSize: "0.82rem" }}>
            Ver no CRM Leads <ArrowRight size={14} style={{ marginLeft: 4 }} />
          </Link>
        </div>

        {status.leads && status.leads.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {status.leads.map((lead, idx) => {
              const telLimpo = lead.telefone ? lead.telefone.replace(/\D/g, "") : "";
              const whatsLink = telLimpo ? `https://wa.me/55${telLimpo}` : "";
              const leadKey = `lead_${idx}_${lead.nome}`;

              return (
                <div
                  key={idx}
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text-primary)" }}>
                          {lead.nome}
                        </span>
                        {lead.categoria && (
                          <span style={{ fontSize: "0.75rem", padding: "2px 8px", borderRadius: 4, background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa" }}>
                            {lead.categoria}
                          </span>
                        )}
                        <span style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: 4, background: "rgba(16, 185, 129, 0.15)", color: "#34d399" }}>
                          ✓ Salvo no CRM
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: 16, fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: 4, flexWrap: "wrap" }}>
                        {lead.telefone ? (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#34d399", fontWeight: 600 }}>
                            <Phone size={13} /> {lead.telefone}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>Sem telefone no snippet</span>
                        )}

                        {(lead.cidade || lead.estado) && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <MapPin size={13} /> {lead.cidade}{lead.estado ? ` - ${lead.estado}` : ""}
                          </span>
                        )}

                        {lead.site && (
                          <a
                            href={lead.site}
                            target="_blank"
                            rel="noreferrer"
                            style={{ display: "flex", alignItems: "center", gap: 4, color: "#818cf8", textDecoration: "none" }}
                          >
                            <ExternalLink size={13} /> {lead.site.includes("instagram.com") ? "Perfil Instagram" : "Site / Link"}
                          </a>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      {whatsLink && (
                        <a
                          href={whatsLink}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-secondary"
                          style={{ fontSize: "0.8rem", padding: "4px 10px", borderColor: "#10b981", color: "#34d399" }}
                        >
                          <MessageSquare size={13} /> Conversar no WhatsApp
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Diagnóstico da IA */}
                  {lead.diagnostico_ia && (
                    <div style={{ fontSize: "0.82rem", padding: "8px 12px", borderRadius: 6, background: "rgba(251, 191, 36, 0.08)", border: "1px solid rgba(251, 191, 36, 0.2)", color: "#fde68a" }}>
                      <strong>🎯 Diagnóstico / Oportunidade detectada:</strong> {lead.diagnostico_ia}
                    </div>
                  )}

                  {/* Pitch Sob Medida Gerado pela IA */}
                  {lead.pitch_sugerido && (
                    <div style={{ fontSize: "0.82rem", padding: "10px 12px", borderRadius: 6, background: "rgba(99, 102, 241, 0.08)", border: "1px solid rgba(99, 102, 241, 0.2)", color: "var(--text-secondary)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, color: "#c7d2fe" }}>
                          ✨ Abordagem Inicial Personalizada (Pitch SDR):
                        </span>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: "0.72rem", padding: "2px 8px" }}
                          onClick={() => copiarPitch(lead.pitch_sugerido!, leadKey)}
                        >
                          {copiadoId === leadKey ? (
                            <>
                              <Check size={12} color="#34d399" /> Copiado!
                            </>
                          ) : (
                            <>
                              <Copy size={12} /> Copiar Texto
                            </>
                          )}
                        </button>
                      </div>
                      <div style={{ whiteSpace: "pre-line", fontStyle: "italic", color: "#e2e8f0" }}>
                        "{lead.pitch_sugerido}"
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Nenhum lead minerado pela IA ainda nesta sessão. Escolha um segmento acima e clique em "Iniciar Prospecção Web com IA"!
          </div>
        )}
      </div>
    </div>
  );
}
