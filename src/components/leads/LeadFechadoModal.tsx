import { useState, useEffect, useRef } from "react";
import {
  X, DollarSign, FileText, Image, Calendar, 
  Upload, Trash2, ExternalLink, Plus, CheckCircle, 
  ClipboardList, StickyNote
} from "lucide-react";
import type { Lead } from "../../data/leads.mock";
import "./LeadFechadoModal.css";

interface Arquivo {
  id: number;
  tipo: string;
  nome_arquivo: string;
  nome_original: string;
  url: string;
  criado_em: string;
}

interface FechamentoData {
  valor_fechado: number;
  data_fechamento: string | null;
  notas_fechamento: string | null;
  arquivos: Arquivo[];
}

interface Props {
  lead: Lead;
  onClose: () => void;
  onSaved?: () => void;
}

type Tab = "detalhes" | "contrato" | "prints";

export function LeadFechadoModal({ lead, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<Tab>("detalhes");
  const [dados, setDados] = useState<FechamentoData>({
    valor_fechado: lead.valorFechado ?? 0,
    data_fechamento: null,
    notas_fechamento: null,
    arquivos: [],
  });
  const [salvando, setSalvando] = useState(false);
  const [uploadingContrato, setUploadingContrato] = useState(false);
  const [uploadingPrint, setUploadingPrint] = useState(false);
  const [saved, setSaved] = useState(false);

  const contratoRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLInputElement>(null);

  // Carregar dados do backend
  useEffect(() => {
    fetch(`/api/leads/${lead.id}/fechamento`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json) setDados(json);
      })
      .catch(() => {});
  }, [lead.id]);

  const contratos = dados.arquivos.filter(a => a.tipo === "contrato");
  const prints = dados.arquivos.filter(a => a.tipo === "print");

  const handleSalvarDetalhes = async () => {
    setSalvando(true);
    try {
      await fetch(`/api/leads/${lead.id}/fechamento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valor_fechado: dados.valor_fechado,
          data_fechamento: dados.data_fechamento || null,
          notas_fechamento: dados.notas_fechamento || null,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved?.();
    } finally {
      setSalvando(false);
    }
  };

  const handleUpload = async (file: File, tipo: "contrato" | "print") => {
    const setUploading = tipo === "contrato" ? setUploadingContrato : setUploadingPrint;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("arquivo", file);
      form.append("tipo", tipo);
      const res = await fetch(`/api/leads/${lead.id}/arquivos`, {
        method: "POST",
        body: form,
      });
      if (res.ok) {
        const novo = await res.json();
        setDados(prev => ({
          ...prev,
          arquivos: [
            {
              id: novo.id,
              tipo: novo.tipo,
              nome_arquivo: novo.nome_arquivo,
              nome_original: novo.nome_original,
              url: novo.url,
              criado_em: novo.criado_em,
            },
            ...prev.arquivos,
          ],
        }));
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (arquivo: Arquivo) => {
    if (!confirm(`Remover "${arquivo.nome_original}"?`)) return;
    const res = await fetch(`/api/leads/arquivos/${arquivo.id}`, { method: "DELETE" });
    if (res.ok) {
      setDados(prev => ({ ...prev, arquivos: prev.arquivos.filter(a => a.id !== arquivo.id) }));
    }
  };

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const formatDate = (s: string) => new Date(s).toLocaleDateString("pt-BR");

  return (
    <div className="lfm-overlay" onClick={onClose}>
      <div className="lfm-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="lfm-header">
          <div className="lfm-header-info">
            <div className="lfm-badge-fechado">
              <CheckCircle size={14} />
              Fechado
            </div>
            <h2 className="lfm-title">{lead.empresa}</h2>
            <p className="lfm-subtitle">{lead.categoria} · {lead.telefone}</p>
          </div>
          <button className="lfm-close" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Tabs */}
        <div className="lfm-tabs">
          {([
            { id: "detalhes" as Tab, label: "Detalhes do Negócio", icon: <ClipboardList size={15} /> },
            { id: "contrato" as Tab, label: `Contrato${contratos.length ? ` (${contratos.length})` : ""}`, icon: <FileText size={15} /> },
            { id: "prints" as Tab, label: `Prints${prints.length ? ` (${prints.length})` : ""}`, icon: <Image size={15} /> },
          ] as { id: Tab; label: string; icon: React.ReactNode }[]).map(t => (
            <button
              key={t.id}
              className={`lfm-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="lfm-body">

          {/* ── ABA DETALHES ── */}
          {tab === "detalhes" && (
            <div className="lfm-section">
              <div className="lfm-field-group">
                <label className="lfm-label">
                  <DollarSign size={14} /> Valor Fechado (R$)
                </label>
                <input
                  className="lfm-input"
                  type="number"
                  min={0}
                  step={0.01}
                  value={dados.valor_fechado || ""}
                  placeholder="Ex: 2500.00"
                  onChange={e => setDados(prev => ({ ...prev, valor_fechado: parseFloat(e.target.value) || 0 }))}
                />
                {dados.valor_fechado > 0 && (
                  <span className="lfm-valor-preview">{formatCurrency(dados.valor_fechado)}</span>
                )}
              </div>

              <div className="lfm-field-group">
                <label className="lfm-label">
                  <Calendar size={14} /> Data do Fechamento
                </label>
                <input
                  className="lfm-input"
                  type="date"
                  value={dados.data_fechamento || ""}
                  onChange={e => setDados(prev => ({ ...prev, data_fechamento: e.target.value }))}
                />
              </div>

              <div className="lfm-field-group">
                <label className="lfm-label">
                  <StickyNote size={14} /> Notas Internas
                </label>
                <textarea
                  className="lfm-textarea"
                  rows={5}
                  placeholder="Detalhes do serviço combinado, escopo, condições especiais, próximos passos..."
                  value={dados.notas_fechamento || ""}
                  onChange={e => setDados(prev => ({ ...prev, notas_fechamento: e.target.value }))}
                />
              </div>

              <div className="lfm-summary-box">
                <h4>Resumo do Lead</h4>
                <div className="lfm-summary-grid">
                  <div className="lfm-summary-item">
                    <span className="lfm-summary-label">Endereço</span>
                    <span className="lfm-summary-value">{lead.endereco || "—"}</span>
                  </div>
                  <div className="lfm-summary-item">
                    <span className="lfm-summary-label">Site</span>
                    <span className="lfm-summary-value">
                      {lead.site
                        ? <a href={lead.site} target="_blank" rel="noopener noreferrer" className="lfm-link">{lead.site} <ExternalLink size={11} /></a>
                        : "—"}
                    </span>
                  </div>
                  <div className="lfm-summary-item">
                    <span className="lfm-summary-label">Score</span>
                    <span className="lfm-summary-value">{lead.score}</span>
                  </div>
                  <div className="lfm-summary-item">
                    <span className="lfm-summary-label">Avaliação</span>
                    <span className="lfm-summary-value">⭐ {lead.avaliacao.toFixed(1)} ({lead.totalAvaliacoes} av.)</span>
                  </div>
                </div>
              </div>

              <div className="lfm-actions">
                <button className="lfm-btn-save" onClick={handleSalvarDetalhes} disabled={salvando}>
                  {saved ? <><CheckCircle size={15} /> Salvo!</> : salvando ? "Salvando..." : "Salvar Detalhes"}
                </button>
              </div>
            </div>
          )}

          {/* ── ABA CONTRATO ── */}
          {tab === "contrato" && (
            <div className="lfm-section">
              <div className="lfm-upload-area" onClick={() => contratoRef.current?.click()}>
                <input
                  ref={contratoRef}
                  type="file"
                  hidden
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0], "contrato")}
                />
                {uploadingContrato ? (
                  <div className="lfm-uploading">Enviando...</div>
                ) : (
                  <>
                    <Upload size={28} className="lfm-upload-icon" />
                    <p className="lfm-upload-label">Clique para enviar o contrato</p>
                    <p className="lfm-upload-hint">PDF, DOC, DOCX, PNG, JPG — máx. 20MB</p>
                  </>
                )}
              </div>

              {contratos.length === 0 ? (
                <p className="lfm-empty">Nenhum contrato enviado ainda.</p>
              ) : (
                <div className="lfm-file-list">
                  {contratos.map(arq => (
                    <div key={arq.id} className="lfm-file-item">
                      <FileText size={18} className="lfm-file-icon" />
                      <div className="lfm-file-info">
                        <span className="lfm-file-name">{arq.nome_original}</span>
                        <span className="lfm-file-date">{formatDate(arq.criado_em)}</span>
                      </div>
                      <div className="lfm-file-actions">
                        <a href={arq.url} target="_blank" rel="noopener noreferrer" className="lfm-file-btn">
                          <ExternalLink size={14} />
                        </a>
                        <button className="lfm-file-btn danger" onClick={() => handleDelete(arq)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── ABA PRINTS ── */}
          {tab === "prints" && (
            <div className="lfm-section">
              <div className="lfm-upload-area" onClick={() => printRef.current?.click()}>
                <input
                  ref={printRef}
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0], "print")}
                />
                {uploadingPrint ? (
                  <div className="lfm-uploading">Enviando...</div>
                ) : (
                  <>
                    <Plus size={28} className="lfm-upload-icon" />
                    <p className="lfm-upload-label">Adicionar print da conversa</p>
                    <p className="lfm-upload-hint">PNG, JPG, WEBP, GIF — máx. 20MB</p>
                  </>
                )}
              </div>

              {prints.length === 0 ? (
                <p className="lfm-empty">Nenhum print enviado ainda.</p>
              ) : (
                <div className="lfm-prints-grid">
                  {prints.map(arq => (
                    <div key={arq.id} className="lfm-print-card">
                      <div className="lfm-print-img-wrap">
                        <img src={arq.url} alt={arq.nome_original} className="lfm-print-img" />
                        <div className="lfm-print-overlay">
                          <a href={arq.url} target="_blank" rel="noopener noreferrer" className="lfm-print-action">
                            <ExternalLink size={16} />
                          </a>
                          <button className="lfm-print-action danger" onClick={() => handleDelete(arq)}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <p className="lfm-print-name">{arq.nome_original}</p>
                      <p className="lfm-print-date">{formatDate(arq.criado_em)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
