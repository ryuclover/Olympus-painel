import { useState, useEffect } from "react";
import {
  CalendarCheck, Calendar, Clock, Phone, Check,
  X, Trash2, Plus, MessageCircle, ExternalLink
} from "lucide-react";
import "./Reunioes.css";

interface Reuniao {
  id: number;
  lead_id: string;
  lead_nome: string;
  telefone: string;
  canal: string;
  titulo: string;
  data_reuniao: string;
  horario_reuniao: string;
  link_reuniao: string;
  status: "agendada" | "concluida" | "cancelada";
  notas: string;
  criado_em: string;
}

export function Reunioes() {
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalNovoAberto, setModalNovoAberto] = useState(false);

  // Form de nova reunião
  const [leadNome, setLeadNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [dataReuniao, setDataReuniao] = useState("");
  const [horarioReuniao, setHorarioReuniao] = useState("14:00");
  const [linkReuniao, setLinkReuniao] = useState("");
  const [notas, setNotas] = useState("");

  useEffect(() => {
    carregarReunioes();
  }, []);

  const carregarReunioes = async () => {
    setCarregando(true);
    try {
      const resp = await fetch("/api/reunioes");
      const data = await resp.json();
      setReunioes(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Erro ao carregar reuniões:", e);
    } finally {
      setCarregando(false);
    }
  };

  const atualizarStatus = async (id: number, status: "concluida" | "cancelada" | "agendada") => {
    try {
      await fetch(`/api/reunioes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      carregarReunioes();
    } catch (e) {
      console.error(e);
    }
  };

  const deletarReuniao = async (id: number) => {
    if (!confirm("Deseja realmente excluir este agendamento?")) return;
    try {
      await fetch(`/api/reunioes/${id}`, { method: "DELETE" });
      carregarReunioes();
    } catch (e) {
      console.error(e);
    }
  };

  const salvarNovaReuniao = async (e: any) => {
    e.preventDefault();
    if (!leadNome.trim() || !dataReuniao || !horarioReuniao) return;

    try {
      const resp = await fetch("/api/reunioes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_nome: leadNome.trim(),
          telefone: telefone.trim(),
          titulo: `Reunião com ${leadNome.trim()}`,
          data_reuniao: dataReuniao,
          horario_reuniao: horarioReuniao,
          link_reuniao: linkReuniao.trim(),
          notas: notas.trim()
        })
      });
      if (resp.ok) {
        setModalNovoAberto(false);
        setLeadNome("");
        setTelefone("");
        setDataReuniao("");
        setLinkReuniao("");
        setNotas("");
        carregarReunioes();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const abrirWhatsappConfirmacao = (r: Reuniao) => {
    const tel = r.telefone.replace(/\D/g, "");
    const msg = encodeURIComponent(
      `Olá, ${r.lead_nome}! Confirmando nossa reunião agendada para ${r.data_reuniao} às ${r.horario_reuniao}.${r.link_reuniao ? ` Link da sala: ${r.link_reuniao}` : ""}`
    );
    window.open(`https://wa.me/${tel.startsWith("55") ? tel : `55${tel}`}?text=${msg}`, "_blank");
  };

  return (
    <div className="reunioes-page">
      <div className="reunioes-header">
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0 0 6px 0", display: "flex", alignItems: "center", gap: 10 }}>
            <CalendarCheck size={28} color="#fbbf24" />
            Reuniões Agendadas
          </h1>
          <p style={{ color: "#9ca3af", margin: 0, fontSize: "0.92rem" }}>
            Acompanhe todas as reuniões comerciais fechadas pela IA ou registradas na sua esteira de vendas.
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setModalNovoAberto(true)}
        >
          <Plus size={16} /> Agendar Nova Reunião
        </button>
      </div>

      {carregando ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>
          Carregando agenda...
        </div>
      ) : reunioes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", background: "#111827", borderRadius: 12, border: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <CalendarCheck size={48} color="#9ca3af" style={{ margin: "0 auto 16px auto", opacity: 0.5 }} />
          <h3 style={{ margin: "0 0 8px 0" }}>Nenhuma reunião agendada no momento</h3>
          <p style={{ color: "#9ca3af", maxWidth: 440, margin: "0 auto 20px auto" }}>
            Conforme o Agente Autônomo interceptar e fechar reuniões pelo WhatsApp, elas aparecerão listadas aqui automaticamente.
          </p>
          <button className="btn-primary" onClick={() => setModalNovoAberto(true)}>
            <Plus size={16} /> Adicionar Reunião Manual
          </button>
        </div>
      ) : (
        <div className="reunioes-grid">
          {reunioes.map((r) => (
            <div key={r.id} className="reuniao-card">
              <div className="reuniao-card-header">
                <div>
                  <h3 className="reuniao-titulo">{r.lead_nome || r.titulo}</h3>
                  <small style={{ color: "#9ca3af" }}>{r.titulo}</small>
                </div>
                <span className={`badge-status ${r.status}`}>
                  {r.status === "agendada" ? "Agendada" : r.status === "concluida" ? "Concluída" : "Cancelada"}
                </span>
              </div>

              <div className="reuniao-info-row">
                <Calendar size={16} color="#fbbf24" />
                <span>Data: <strong>{r.data_reuniao}</strong></span>
              </div>

              <div className="reuniao-info-row">
                <Clock size={16} color="#fbbf24" />
                <span>Horário: <strong>{r.horario_reuniao}</strong></span>
              </div>

              {r.telefone && (
                <div className="reuniao-info-row">
                  <Phone size={16} color="#34d399" />
                  <span>{r.telefone}</span>
                </div>
              )}

              {r.link_reuniao && (
                <div className="reuniao-info-row">
                  <ExternalLink size={16} color="#60a5fa" />
                  <a href={r.link_reuniao} target="_blank" rel="noreferrer" style={{ color: "#60a5fa", textDecoration: "underline" }}>
                    Abrir link da sala
                  </a>
                </div>
              )}

              {r.notas && (
                <p style={{ fontSize: "0.82rem", color: "#94a3b8", background: "rgba(0,0,0,0.25)", padding: 8, borderRadius: 6, margin: 0 }}>
                  {r.notas}
                </p>
              )}

              <div className="reuniao-actions">
                {r.telefone && (
                  <button
                    className="btn-small whatsapp"
                    onClick={() => abrirWhatsappConfirmacao(r)}
                    title="Enviar confirmação no WhatsApp"
                  >
                    <MessageCircle size={14} /> WhatsApp
                  </button>
                )}
                {r.status === "agendada" && (
                  <>
                    <button
                      className="btn-small"
                      onClick={() => atualizarStatus(r.id, "concluida")}
                      title="Marcar como Concluída"
                    >
                      <Check size={14} color="#34d399" /> Concluir
                    </button>
                    <button
                      className="btn-small"
                      onClick={() => atualizarStatus(r.id, "cancelada")}
                      title="Cancelar Reunião"
                    >
                      <X size={14} color="#f87171" /> Cancelar
                    </button>
                  </>
                )}
                <button
                  className="btn-small"
                  onClick={() => deletarReuniao(r.id)}
                  title="Excluir do histórico"
                  style={{ marginLeft: "auto", color: "#f87171" }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Nova Reunião */}
      {modalNovoAberto && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center",
          justifyContent: "center", zIndex: 1000, padding: 16
        }}>
          <div style={{
            background: "#111827", borderRadius: 12, padding: 24,
            width: "100%", maxWidth: 480, border: "1px solid rgba(255,255,255,0.12)"
          }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 16px 0" }}>
              Nova Reunião Comercial
            </h2>
            <form onSubmit={salvarNovaReuniao}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: "0.85rem", color: "#cbd5e1", marginBottom: 4 }}>Nome do Cliente / Empresa</label>
                <input
                  type="text"
                  required
                  style={{ width: "100%", padding: 10, background: "#090d16", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", boxSizing: "border-box" }}
                  value={leadNome}
                  onChange={(e) => setLeadNome(e.target.value)}
                  placeholder="Ex: Dr. Silva / Clínica Sorriso"
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: "0.85rem", color: "#cbd5e1", marginBottom: 4 }}>WhatsApp do Cliente</label>
                <input
                  type="text"
                  style={{ width: "100%", padding: 10, background: "#090d16", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", boxSizing: "border-box" }}
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="Ex: 11999998888"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", color: "#cbd5e1", marginBottom: 4 }}>Data da Reunião</label>
                  <input
                    type="date"
                    required
                    style={{ width: "100%", padding: 10, background: "#090d16", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", boxSizing: "border-box" }}
                    value={dataReuniao}
                    onChange={(e) => setDataReuniao(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", color: "#cbd5e1", marginBottom: 4 }}>Horário</label>
                  <input
                    type="time"
                    required
                    style={{ width: "100%", padding: 10, background: "#090d16", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", boxSizing: "border-box" }}
                    value={horarioReuniao}
                    onChange={(e) => setHorarioReuniao(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: "0.85rem", color: "#cbd5e1", marginBottom: 4 }}>Link da Sala (Google Meet / Zoom)</label>
                <input
                  type="url"
                  style={{ width: "100%", padding: 10, background: "#090d16", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", boxSizing: "border-box" }}
                  value={linkReuniao}
                  onChange={(e) => setLinkReuniao(e.target.value)}
                  placeholder="https://meet.google.com/..."
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: "block", fontSize: "0.85rem", color: "#cbd5e1", marginBottom: 4 }}>Notas / Assunto</label>
                <textarea
                  style={{ width: "100%", padding: 10, background: "#090d16", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", boxSizing: "border-box", minHeight: 60 }}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Apresentação de proposta de reformulação do site..."
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setModalNovoAberto(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  Salvar Reunião
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
