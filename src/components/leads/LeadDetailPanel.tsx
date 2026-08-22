import type { Lead } from "../../data/leads.mock";
import { ScoreBadge } from "./ScoreBadge";
import {
  X, MapPin, Phone, Mail, Globe, Star, MessageCircle,
  Map, Search, Tag, Check, Camera, Clock, Edit3
} from "lucide-react";
import { useState } from "react";

const TABS = ["Resumo", "Contatos", "Atividades", "Notas", "Arquivos"];

function EnrRow({ icon: Icon, label, found }: { icon: any; label: string; found: boolean }) {
  return (
    <div className="enr-row">
      <Icon size={14} className="enr-icon" />
      <span className="enr-label">{label}</span>
      <span className={`enr-status ${found ? "enr-found" : "enr-not-found"}`}>
        {found ? <Check size={12} /> : <X size={12} />}
        {found ? "Encontrado" : "Nao encontrado"}
      </span>
    </div>
  );
}

interface Props {
  lead: Lead | null;
  onClose: () => void;
}

export function LeadDetailPanel({ lead, onClose }: Props) {
  const [tab, setTab] = useState("Resumo");
  const [obs, setObs] = useState("");

  if (!lead) return null;

  const maxBar = Math.max(...lead.avaliacaoDistribuicao.map(d => d.quantidade));

  return (
    <aside className="detail-panel">
      <div className="detail-header">
        <div className="detail-title-row">
          <div>
            <div className="detail-company">{lead.empresa} <Edit3 size={13} className="detail-edit" /></div>
            <div className="detail-score-row">
              <span className="detail-score-label">Score {lead.score}</span>
              <ScoreBadge status={lead.status} />
            </div>
          </div>
          <button className="detail-close" onClick={onClose}><X size={18} /></button>
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
            <section className="detail-section">
              <h4 className="detail-section-title">Informacoes</h4>
              <div className="detail-info-list">
                <div className="detail-info-row"><MapPin size={13} /><span>{lead.endereco}, {lead.cidade} – {lead.estado}</span></div>
                {lead.telefone && <div className="detail-info-row"><Phone size={13} /><a href={`tel:${lead.telefone}`}>{lead.telefone}</a></div>}
                {lead.site ? <div className="detail-info-row"><Globe size={13} /><a href={lead.site} target="_blank" rel="noreferrer">{lead.site}</a></div>
                  : <div className="detail-info-row"><Globe size={13} /><span className="text-muted">Sem site</span></div>}
                {lead.email ? <div className="detail-info-row"><Mail size={13} /><a href={`mailto:${lead.email}`}>{lead.email}</a></div>
                  : <div className="detail-info-row"><Mail size={13} /><span className="text-muted">Sem e-mail</span></div>}
              </div>
            </section>

            <section className="detail-section">
              <h4 className="detail-section-title">Avaliacoes do Google</h4>
              <div className="rating-header">
                <span className="rating-big">{lead.avaliacao}</span>
                <div>
                  <div className="rating-stars">
                    {[1,2,3,4,5].map(s => <Star key={s} size={14} fill={s <= Math.round(lead.avaliacao) ? "#f59e0b" : "transparent"} color="#f59e0b" />)}
                  </div>
                  <span className="rating-count">{lead.totalAvaliacoes} avaliacoes</span>
                </div>
              </div>
              <div className="rating-bars">
                {[...lead.avaliacaoDistribuicao].reverse().map(d => (
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
              <EnrRow icon={Globe} label="Dominio / Site" found={lead.enriquecimento.site} />
              <EnrRow icon={MessageCircle} label="WhatsApp Business" found={lead.enriquecimento.whatsappBusiness} />
              {lead.enriquecimento.horarioFuncionamento && (
                <div className="enr-row">
                  <Clock size={14} className="enr-icon" />
                  <span className="enr-label">Horario</span>
                  <span className="enr-value">{lead.enriquecimento.horarioFuncionamento}</span>
                </div>
              )}
            </section>

            <section className="detail-section">
              <h4 className="detail-section-title">Acoes rapidas</h4>
              <div className="quick-actions">
                <button className="btn-green"><MessageCircle size={14} /> Abrir WhatsApp</button>
                <button className="btn-outline"><Map size={14} /> Ver no Google Maps</button>
              </div>
              <div className="quick-actions" style={{marginTop:8}}>
                <button className="btn-outline"><Search size={14} /> Buscar e-mail</button>
                <button className="btn-outline"><Search size={14} /> Mais acoes</button>
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

            <section className="detail-section">
              <h4 className="detail-section-title">Observacao rapida</h4>
              <textarea
                className="obs-textarea"
                placeholder="Escreva uma observacao..."
                value={obs}
                onChange={e => setObs(e.target.value)}
                rows={3}
              />
              <button className="btn-green" style={{marginTop:8}}>Salvar</button>
            </section>
          </>
        )}
        {tab !== "Resumo" && (
          <div className="tab-empty">
            <p>Nada por aqui ainda.</p>
          </div>
        )}
      </div>
    </aside>
  );
}
