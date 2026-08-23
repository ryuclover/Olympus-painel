import type { Lead } from "../../data/leads.mock";
import {
  X, MapPin, Phone, Mail, Globe, Star, MessageCircle,
  Map, Tag, Check, Camera, Clock, Edit3, CheckCircle2,
  ExternalLink, ChevronDown, Send, Trash2
} from "lucide-react";
import { useState, useEffect } from "react";

const TABS = ["Resumo", "Contrato", "Prints", "Notas"];

function EnrRow({ icon: Icon, label, found }: { icon: any; label: string; found: boolean }) {
  return (
    <div className="enr-row">
      <Icon size={14} className="enr-icon" />
      <span className="enr-label">{label}</span>
      <span className={`enr-status ${found ? "enr-found" : "enr-not-found"}`}>
        {found ? <Check size={12} /> : <X size={12} />}
        {found ? "Encontrado" : "Não encontrado"}
      </span>
    </div>
  );
}

interface Props {
  lead: Lead | null;
  onClose: () => void;
  onLeadUpdate?: (lead: Lead) => void;
}

export function LeadDetailPanel({ lead, onClose, onLeadUpdate }: Props) {
  const [tab, setTab] = useState("Resumo");
  const [obs, setObs] = useState("");
  const [salvandoStatus, setSalvandoStatus] = useState(false);
  const [salvandoObs, setSalvandoObs] = useState(false);
  const [obsSalva, setObsSalva] = useState(false);
  const [whatsappMsg, setWhatsappMsg] = useState("");
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [valorFechadoLocal, setValorFechadoLocal] = useState("");
  const [salvandoValor, setSalvandoValor] = useState(false);

  const [arquivos, setArquivos] = useState<any[]>([]);
  const [carregandoArquivos, setCarregandoArquivos] = useState(false);
  const [uploading, setUploading] = useState(false);

  const aplicarTemplate = (msg: string, leadData: Lead) => {
    let t = msg;
    t = t.replace(/{nome}/g, leadData.empresa || "");
    t = t.replace(/{nicho}/g, leadData.categoria || "");
    t = t.replace(/{cidade}/g, leadData.cidade || "");
    return t;
  };

  useEffect(() => {
    if (lead) {
      setObs(lead.observacao || "");
      setObsSalva(false);
      setValorFechadoLocal(lead.valorFechado?.toString() || "");
      
      // Fetch default template
      fetch("/api/templates")
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            setTemplates(data);
            const padrao = data.find((t: any) => t.is_padrao) || data[0];
            setSelectedTemplateId(padrao.id);
            setWhatsappMsg(aplicarTemplate(padrao.mensagem, lead));
          } else {
            setWhatsappMsg(`Olá! Vi a ${lead.empresa} no Google e gostaria de conversar.`);
          }
        })
        .catch(() => {
          setWhatsappMsg(`Olá! Vi a ${lead.empresa} no Google e gostaria de conversar.`);
        });
    }
  }, [lead?.id]);

  useEffect(() => {
    if (lead && (tab === "Contrato" || tab === "Prints")) {
      carregarArquivos();
    }
  }, [lead?.id, tab]);

  const carregarArquivos = async () => {
    if (!lead) return;
    setCarregandoArquivos(true);
    try {
      const resp = await fetch(`/api/leads/${encodeURIComponent(lead.id)}/arquivos`);
      const data = await resp.json();
      setArquivos(Array.isArray(data) ? data : []);
    } catch(e) {
      console.error(e);
    } finally {
      setCarregandoArquivos(false);
    }
  };

  const handleUpload = async (e: any, tipo: string) => {
    if (!lead || !e.target.files?.[0]) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("arquivo", e.target.files[0]);
    formData.append("tipo", tipo.toLowerCase());
    
    try {
      const resp = await fetch(`/api/leads/${encodeURIComponent(lead.id)}/arquivos`, {
        method: "POST",
        body: formData,
      });
      if (resp.ok) {
        carregarArquivos();
      }
    } catch(err) {
      console.error(err);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDeletarArquivo = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir este arquivo?")) return;
    try {
      await fetch(`/api/leads/arquivos/${id}`, { method: "DELETE" });
      carregarArquivos();
    } catch(e) {
      console.error(e);
    }
  };

  const handleSalvarValorFechado = async () => {
    if (!lead) return;
    setSalvandoValor(true);
    try {
      const resp = await fetch(`/api/leads/${encodeURIComponent(lead.id)}/fechamento`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor_fechado: parseFloat(valorFechadoLocal) || 0 }),
      });
      if (resp.ok) {
        onLeadUpdate?.({ ...lead, valorFechado: parseFloat(valorFechadoLocal) || 0 });
      }
    } catch (e) {
      console.error("Erro ao salvar valor:", e);
    } finally {
      setSalvandoValor(false);
    }
  };

  if (!lead) return null;

  const maxBar = Math.max(...(lead.avaliacaoDistribuicao || []).map(d => d.quantidade), 1);
  const isContatado = lead.status?.toLowerCase() === "contatado";

  // Formata telefone para WhatsApp (apenas números)
  const telefoneLimpo = (lead.telefone || "").replace(/\D/g, "");
  const whatsappUrl = telefoneLimpo
    ? `https://wa.me/55${telefoneLimpo}?text=${encodeURIComponent(whatsappMsg || `Olá! Vi a ${lead.empresa} no Google e gostaria de conversar.`)}`
    : null;

  // URL para Google Maps
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lead.empresa} ${lead.endereco}`)}`;

  // Atualizar status no backend e no frontend
  const handleMudarStatus = async (novoStatus: string) => {
    setSalvandoStatus(true);
    try {
      const resp = await fetch(`/api/leads/${encodeURIComponent(lead.id)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novoStatus }),
      });
      if (resp.ok) {
        const atualizado: Lead = {
          ...lead,
          status: novoStatus as Lead["status"],
          etapa: novoStatus as Lead["etapa"],
        };
        onLeadUpdate?.(atualizado);
      }
    } catch (e) {
      console.error("Erro ao atualizar status:", e);
    } finally {
      setSalvandoStatus(false);
    }
  };

  // Toggle do botão "Entrei em contato"
  const handleToggleContatado = async () => {
    const proximoStatus = isContatado ? "novo" : "contatado";
    await handleMudarStatus(proximoStatus);
  };

  // Abrir WhatsApp e marcar automaticamente como contatado
  const handleAbrirWhatsApp = () => {
    if (whatsappUrl) {
      window.open(whatsappUrl, "_blank");
      if (!isContatado) {
        handleMudarStatus("contatado");
      }
    } else {
      alert("Este lead não possui telefone cadastrado para WhatsApp.");
    }
  };

  // Salvar observações
  const handleSalvarObs = async () => {
    if (!obs.trim()) return;
    setSalvandoObs(true);
    try {
      const resp = await fetch(`/api/leads/${encodeURIComponent(lead.id)}/observacoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observacoes: obs }),
      });
      if (resp.ok) {
        setObsSalva(true);
        setTimeout(() => setObsSalva(false), 3000);
      }
    } catch (e) {
      console.error("Erro ao salvar observação:", e);
    } finally {
      setSalvandoObs(false);
    }
  };

  return (
    <aside className="detail-panel">
      {lead.fotoUrl && (
        <div style={{ width: "100%", height: "140px", overflow: "hidden", borderBottom: "1px solid var(--border)" }}>
          <img src={lead.fotoUrl} alt={lead.empresa} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      )}
      <div className="detail-header">
        <div className="detail-title-row">
          <div>
            <div className="detail-company">{lead.empresa} <Edit3 size={13} className="detail-edit" /></div>
            <div className="detail-score-row">
              <span className="detail-score-label">Score {lead.score}</span>
              <div className="status-select-wrapper">
                <select
                  className="status-select"
                  value={lead.status?.toLowerCase() || "novo"}
                  onChange={e => handleMudarStatus(e.target.value)}
                  disabled={salvandoStatus}
                >
                  <option value="novo">Novo</option>
                  <option value="contatado">Contatado</option>
                  <option value="respondeu">Respondeu</option>
                  <option value="qualificado">Qualificado</option>
                  <option value="fechado">Fechado</option>
                  <option value="ignorado">Ignorado</option>
                </select>
                <ChevronDown size={11} className="select-icon" style={{ right: 8 }} />
              </div>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="detail-tabs">
          {TABS.map(t => (
            <button key={t} className={`detail-tab ${tab === t ? "detail-tab-active" : ""}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
      </div>

      <div className="detail-body">
        {tab === "Resumo" && (
          <>
            {/* BOTÃO PRINCIPAL: ENTREI EM CONTATO */}
            <section className="detail-section" style={{ paddingBottom: 0 }}>
              <button
                className={isContatado ? "btn-contatado-active" : "btn-contatado"}
                onClick={handleToggleContatado}
                disabled={salvandoStatus}
                title={isContatado ? "Clique para desmarcar ou mudar status" : "Marcar que você já entrou em contato com este lead"}
              >
                {isContatado ? (
                  <><CheckCircle2 size={16} /> ✓ Já entrei em contato</>
                ) : (
                  <><Send size={16} /> Entrei em contato</>
                )}
              </button>
            </section>

            {lead.status === "fechado" && (
              <section className="detail-section" style={{ background: "rgba(16, 185, 129, 0.05)", borderColor: "rgba(16, 185, 129, 0.2)", borderRadius: 8, padding: 16, marginTop: 16 }}>
                <h4 className="detail-section-title" style={{ color: "var(--accent-green)", margin: 0 }}>Valor Fechado</h4>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <input
                    type="number"
                    className="obs-textarea"
                    style={{ minHeight: "unset", height: 38, padding: "0 12px", width: "100%" }}
                    placeholder="Ex: 2500.00"
                    value={valorFechadoLocal}
                    onChange={e => setValorFechadoLocal(e.target.value)}
                  />
                  <button
                    className="btn-search"
                    style={{ padding: "0 16px", height: 38, whiteSpace: "nowrap" }}
                    onClick={handleSalvarValorFechado}
                    disabled={salvandoValor}
                  >
                    {salvandoValor ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </section>
            )}

            <section className="detail-section">
              <h4 className="detail-section-title">Informações de contato</h4>
              <div className="detail-info-list">
                <div className="detail-info-row">
                  <MapPin size={13} />
                  <span>{lead.endereco || `${lead.cidade}, ${lead.estado}`}</span>
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="link-ext" title="Ver no Google Maps">
                    <ExternalLink size={11} />
                  </a>
                </div>
                {lead.telefone ? (
                  <div className="detail-info-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Phone size={13} />
                      <a href={`tel:${lead.telefone}`}>{lead.telefone}</a>
                    </div>
                    {lead.temWhatsapp ? (
                      <span className="badge-wpp-tag" style={{ fontSize: "0.72rem" }}>WhatsApp Disponível</span>
                    ) : lead.tipoTelefone === "fixo" ? (
                      <span className="badge-fixo-tag" style={{ fontSize: "0.72rem" }}>Telefone Fixo</span>
                    ) : null}
                  </div>
                ) : (
                  <div className="detail-info-row"><Phone size={13} /><span className="text-muted">Sem telefone</span></div>
                )}
                {lead.site ? (
                  <div className="detail-info-row">
                    <Globe size={13} />
                    <a href={lead.site.startsWith("http") ? lead.site : `https://${lead.site}`} target="_blank" rel="noopener noreferrer">
                      {lead.site}
                    </a>
                  </div>
                ) : (
                  <div className="detail-info-row"><Globe size={13} /><span className="text-muted">Sem site</span></div>
                )}
                {lead.email ? <div className="detail-info-row"><Mail size={13} /><a href={`mailto:${lead.email}`}>{lead.email}</a></div>
                  : <div className="detail-info-row"><Mail size={13} /><span className="text-muted">Sem e-mail</span></div>}
              </div>
            </section>

            <section className="detail-section">
              <h4 className="detail-section-title">Avaliações do Google</h4>
              <div className="rating-header">
                <span className="rating-big">{lead.avaliacao}</span>
                <div>
                  <div className="rating-stars">
                    {[1,2,3,4,5].map(s => <Star key={s} size={14} fill={s <= Math.round(lead.avaliacao) ? "#f59e0b" : "transparent"} color="#f59e0b" />)}
                  </div>
                  <span className="rating-count">{lead.totalAvaliacoes} avaliações</span>
                </div>
              </div>
              <div className="rating-bars">
                {[...(lead.avaliacaoDistribuicao || [])].reverse().map(d => (
                  <div key={d.estrelas} className="rating-bar-row">
                    <span className="rating-bar-label">{d.estrelas}</span>
                    <div className="rating-bar-track">
                      <div className="rating-bar-fill" style={{ width: `${(d.quantidade / maxBar) * 100}%` }} />
                    </div>
                    <span className="rating-bar-qty">{d.quantidade}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="detail-section">
              <h4 className="detail-section-title">Enriquecimento</h4>
              <EnrRow icon={Camera} label="Instagram" found={lead.enriquecimento.instagram} />
              <EnrRow icon={Mail} label="E-mail" found={lead.enriquecimento.email} />
              <EnrRow icon={Globe} label="Domínio / Site" found={lead.enriquecimento.site} />
              <EnrRow icon={MessageCircle} label="WhatsApp Business" found={lead.enriquecimento.whatsappBusiness} />
              {lead.enriquecimento.horarioFuncionamento && (
                <div className="enr-row">
                  <Clock size={14} className="enr-icon" />
                  <span className="enr-label">Horário</span>
                  <span className="enr-value">{lead.enriquecimento.horarioFuncionamento}</span>
                </div>
              )}
            </section>

            <section className="detail-section">
              <h4 className="detail-section-title">Ações rápidas</h4>
              <div className="quick-actions" style={{ marginBottom: 12 }}>
                <a
                  className="btn-outline"
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flex: 1 }}
                >
                  <Map size={14} /> Google Maps <ExternalLink size={11} />
                </a>
              </div>
              
              <div style={{ background: "var(--bg-secondary)", padding: 12, borderRadius: 8, border: "1px solid var(--border-color)" }}>
                <h5 style={{ margin: "0 0 8px 0", fontSize: 13, color: "var(--text-primary)" }}>Mensagem WhatsApp</h5>
                {templates.length > 0 && (
                  <select 
                    style={{ width: "100%", padding: 6, marginBottom: 8, borderRadius: 4, border: "1px solid var(--border-color)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: 13 }}
                    value={selectedTemplateId || ""}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      setSelectedTemplateId(id);
                      const t = templates.find(x => x.id === id);
                      if (t) setWhatsappMsg(aplicarTemplate(t.mensagem, lead));
                    }}
                  >
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.titulo} {t.is_padrao ? "(Padrão)" : ""}</option>
                    ))}
                  </select>
                )}
                <textarea
                  style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border-color)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: 13, resize: "vertical", minHeight: 80 }}
                  value={whatsappMsg}
                  onChange={e => setWhatsappMsg(e.target.value)}
                />
                <button
                  className="btn-green"
                  style={{ width: "100%", marginTop: 8 }}
                  onClick={handleAbrirWhatsApp}
                >
                  <MessageCircle size={14} /> Enviar Mensagem
                </button>
              </div>
            </section>

            <section className="detail-section">
              <h4 className="detail-section-title">Tags</h4>
              <div className="tags-list">
                {lead.tags.map(t => (
                  <span key={t} className="tag"><Tag size={10} />{t}</span>
                ))}
                <button className="tag-add">+ Adicionar</button>
              </div>
            </section>
          </>
        )}
        {(tab === "Contrato" || tab === "Prints") && (
          <div style={{ padding: 20 }}>
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ margin: "0 0 12px 0", color: "var(--text-primary)" }}>
                Upload de {tab === "Contrato" ? "Contrato" : "Print da Conversa"}
              </h4>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <input 
                  type="file" 
                  id="file-upload" 
                  style={{ display: "none" }} 
                  onChange={e => handleUpload(e, tab === "Contrato" ? "contrato" : "print")}
                  disabled={uploading}
                />
                <label htmlFor="file-upload" className="btn-primary" style={{ cursor: "pointer", display: "inline-block" }}>
                  {uploading ? "Enviando..." : `Selecionar ${tab === "Contrato" ? "PDF/Imagem" : "Imagem"}`}
                </label>
              </div>
            </div>

            {carregandoArquivos ? (
              <p className="text-muted">Carregando arquivos...</p>
            ) : arquivos.filter(a => a.tipo === (tab === "Contrato" ? "contrato" : "print")).length === 0 ? (
              <div className="tab-empty" style={{ border: "1px dashed var(--border-color)", padding: 40, borderRadius: 8 }}>
                <p>Nenhum {tab === "Contrato" ? "contrato" : "print"} salvo para este lead.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {arquivos.filter(a => a.tipo === (tab === "Contrato" ? "contrato" : "print")).map(arq => (
                  <div key={arq.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, background: "var(--bg-secondary)", borderRadius: 8, border: "1px solid var(--border-color)" }}>
                    <a href={`/uploads/${arq.nome_arquivo}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent-blue)", textDecoration: "none", fontSize: 13, wordBreak: "break-all" }}>
                      {arq.nome_arquivo}
                    </a>
                    <button className="btn-outline" style={{ padding: "4px 8px", color: "var(--accent-red)", borderColor: "transparent" }} onClick={() => handleDeletarArquivo(arq.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        
        {tab === "Notas" && (
          <div style={{ padding: 20 }}>
            <h4 style={{ margin: "0 0 12px 0", color: "var(--text-primary)" }}>Diário de Bordo (Notas)</h4>
            <textarea
              style={{ width: "100%", minHeight: 200, padding: 12, borderRadius: 8, border: "1px solid var(--border-color)", background: "var(--bg-secondary)", color: "var(--text-primary)", fontSize: 14, resize: "vertical" }}
              placeholder="Anotações importantes sobre a negociação..."
              value={obs}
              onChange={e => setObs(e.target.value)}
            />
            <button
              className="btn-primary"
              style={{ marginTop: 12 }}
              onClick={handleSalvarObs}
              disabled={salvandoObs || !obs.trim()}
            >
              {obsSalva ? "✓ Salvo com sucesso!" : salvandoObs ? "Salvando..." : "Salvar Anotações"}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
