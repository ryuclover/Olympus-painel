import { useState, useEffect } from "react";
import { 
  X, Send, ShieldCheck, Clock, AlertTriangle, Play, Pause, Trash2, CheckCircle2, RefreshCw 
} from "lucide-react";
import type { Lead } from "../../data/leads.mock";

interface Props {
  leadsSelecionados: Lead[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface FilaItem {
  id: number;
  lead_id: string;
  nome: string;
  telefone: string;
  mensagem: string;
  status: "pendente" | "processando" | "enviado" | "falha" | "cancelado";
  agendado_para: string;
  enviado_em?: string;
  erro?: string;
}

interface FilaStats {
  total: number;
  pendentes: number;
  enviados: number;
  falhas: number;
}

export function ModalEnvioMassa({ leadsSelecionados, isOpen, onClose, onSuccess }: Props) {
  const [tab, setTab] = useState<"configurar" | "fila">("configurar");
  const [template, setTemplate] = useState(
    "{Olá|Oi|Tudo bem}, {primeiro_nome}! Vi seu negócio no Google Maps e reparei que seu perfil pode receber muito mais clientes pelo WhatsApp. Podemos conversar rapidinho?"
  );
  const [delayMin, setDelayMin] = useState(25);
  const [delayMax, setDelayMax] = useState(50);
  const [salvando, setSalvando] = useState(false);
  
  // Estado da Fila
  const [fila, setFila] = useState<FilaItem[]>([]);
  const [stats, setStats] = useState<FilaStats>({ total: 0, pendentes: 0, enviados: 0, falhas: 0 });
  const [executandoAutomacao, setExecutandoAutomacao] = useState(false);
  const [indiceAtual, setIndiceAtual] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      carregarFila();
    }
  }, [isOpen]);

  const carregarFila = async () => {
    try {
      const res = await fetch("/api/whatsapp/fila");
      const data = await res.json();
      if (data.itens) {
        setFila(data.itens);
        setStats(data.stats);
        if (data.itens.length > 0 && tab === "configurar" && leadsSelecionados.length === 0) {
          setTab("fila");
        }
      }
    } catch (e) {
      console.error("Erro ao carregar fila:", e);
    }
  };

  if (!isOpen) return null;

  const handleAdicionarFila = async () => {
    if (!leadsSelecionados.length) return;
    setSalvando(true);
    try {
      const res = await fetch("/api/whatsapp/fila/adicionar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: leadsSelecionados,
          mensagem: template,
          delay_min_segundos: delayMin,
          delay_max_segundos: delayMax,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        await carregarFila();
        setTab("fila");
        onSuccess?.();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSalvando(false);
    }
  };

  const handleLimparFila = async (apenasConcluidos = false) => {
    if (!confirm(apenasConcluidos ? "Limpar mensagens já finalizadas?" : "Deseja esvaziar toda a fila de disparos?")) return;
    try {
      await fetch("/api/whatsapp/fila/limpar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apenas_concluidos: apenasConcluidos }),
      });
      carregarFila();
    } catch (e) {
      console.error(e);
    }
  };

  const handleMarcarStatus = async (id: number, status: string) => {
    try {
      await fetch(`/api/whatsapp/fila/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      carregarFila();
    } catch (e) {
      console.error(e);
    }
  };

  // Disparo Assistido Humano (Abre aba por aba com o tempo recomendado para 0% de risco de ban)
  const iniciarDisparoHumano = async () => {
    const pendentes = fila.filter(f => f.status === "pendente");
    if (!pendentes.length) {
      alert("Não há mensagens pendentes na fila.");
      return;
    }

    setExecutandoAutomacao(true);

    for (let i = 0; i < pendentes.length; i++) {
      const item = pendentes[i];
      setIndiceAtual(item.id);

      // Marca como processando
      await handleMarcarStatus(item.id, "processando");

      // Abre o WhatsApp Web com texto preenchido
      const tel = item.telefone.replace(/\D/g, "");
      const ddiTel = tel.startsWith("55") ? tel : `55${tel}`;
      const url = `https://wa.me/${ddiTel}?text=${encodeURIComponent(item.mensagem)}`;
      window.open(url, "_blank");

      // Marca como enviado
      await handleMarcarStatus(item.id, "enviado");

      // Se não for o último, aguarda o delay humanizado anti-ban
      if (i < pendentes.length - 1) {
        const tempoEspera = Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin);
        await new Promise(r => setTimeout(r, tempoEspera * 1000));
      }
    }

    setExecutandoAutomacao(false);
    setIndiceAtual(null);
    carregarFila();
  };

  return (
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
      <div className="modal-content" style={{ background: "#111827", borderRadius: 12, border: "1px solid #374151", width: "100%", maxWidth: 650, color: "#f3f4f6", display: "flex", flexDirection: "column", maxHeight: "90vh" }}>
        
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #1f2937", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: "#065f46", color: "#34d399", padding: "6px 8px", borderRadius: 8 }}>
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Disparo em Massa Inteligente (Anti-Ban)</h3>
              <p style={{ margin: 0, fontSize: "0.78rem", color: "#9ca3af" }}>Envio humanizado com fila de espera e variação textual</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#9ca3af", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #1f2937", background: "#0b0f19" }}>
          <button 
            onClick={() => setTab("configurar")}
            style={{ flex: 1, padding: "12px", background: tab === "configurar" ? "#1f2937" : "transparent", border: "none", color: tab === "configurar" ? "#10b981" : "#9ca3af", fontWeight: 600, cursor: "pointer", borderBottom: tab === "configurar" ? "2px solid #10b981" : "none" }}
          >
            1. Configurar Mensagem ({leadsSelecionados.length} selecionados)
          </button>
          <button 
            onClick={() => setTab("fila")}
            style={{ flex: 1, padding: "12px", background: tab === "fila" ? "#1f2937" : "transparent", border: "none", color: tab === "fila" ? "#10b981" : "#9ca3af", fontWeight: 600, cursor: "pointer", borderBottom: tab === "fila" ? "2px solid #10b981" : "none" }}
          >
            2. Fila de Envios ({stats.pendentes} pendentes)
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          {tab === "configurar" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Box de Segurança WhatsApp */}
              <div style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: 8, padding: "12px 14px", fontSize: "0.82rem", color: "#a7f3d0" }}>
                <strong>🛡️ Estratégia Anti-Bloqueio Meta 2026:</strong>
                <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                  <li><strong>Spintax Ativo:</strong> use <code>{'{Olá|Oi|Tudo bem}'}</code> para o WhatsApp nunca receber duas mensagens iguais.</li>
                  <li><strong>Intervalo Humano:</strong> envio espaçado de 25 a 50 segundos simula digitação natural de pessoa real.</li>
                  <li><strong>Variáveis Dinâmicas:</strong> <code>{'{primeiro_nome}'}</code>, <code>{'{cidade}'}</code>, <code>{'{categoria}'}</code>.</li>
                </ul>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 6, color: "#d1d5db" }}>
                  Mensagem com Variações (Spintax):
                </label>
                <textarea 
                  rows={5}
                  value={template}
                  onChange={e => setTemplate(e.target.value)}
                  style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #374151", background: "#1f2937", color: "#fff", fontSize: "0.88rem", resize: "vertical" }}
                />
              </div>

              {/* Controles de Intervalo */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: "0.8rem", color: "#9ca3af", display: "block", marginBottom: 4 }}>Intervalo Mínimo (segundos):</label>
                  <input 
                    type="number" 
                    min={10} 
                    max={120} 
                    value={delayMin} 
                    onChange={e => setDelayMin(Number(e.target.value))}
                    style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #374151", background: "#1f2937", color: "#fff" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "0.8rem", color: "#9ca3af", display: "block", marginBottom: 4 }}>Intervalo Máximo (segundos):</label>
                  <input 
                    type="number" 
                    min={20} 
                    max={180} 
                    value={delayMax} 
                    onChange={e => setDelayMax(Number(e.target.value))}
                    style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #374151", background: "#1f2937", color: "#fff" }}
                  />
                </div>
              </div>

              <div style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                ⏱️ Tempo estimado para {leadsSelecionados.length} contatos: <strong>~{Math.round((leadsSelecionados.length * ((delayMin + delayMax) / 2)) / 60)} minutos</strong>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Placar de Envios */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, textAlign: "center" }}>
                <div style={{ background: "#1f2937", padding: "8px", borderRadius: 8 }}>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>{stats.total}</div>
                  <div style={{ fontSize: "0.72rem", color: "#9ca3af" }}>Total</div>
                </div>
                <div style={{ background: "#1f2937", padding: "8px", borderRadius: 8, borderLeft: "3px solid #f59e0b" }}>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fbbf24" }}>{stats.pendentes}</div>
                  <div style={{ fontSize: "0.72rem", color: "#9ca3af" }}>Pendentes</div>
                </div>
                <div style={{ background: "#1f2937", padding: "8px", borderRadius: 8, borderLeft: "3px solid #10b981" }}>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#34d399" }}>{stats.enviados}</div>
                  <div style={{ fontSize: "0.72rem", color: "#9ca3af" }}>Enviados</div>
                </div>
                <div style={{ background: "#1f2937", padding: "8px", borderRadius: 8, borderLeft: "3px solid #ef4444" }}>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#f87171" }}>{stats.falhas}</div>
                  <div style={{ fontSize: "0.72rem", color: "#9ca3af" }}>Falhas</div>
                </div>
              </div>

              {/* Botões de Ação da Fila */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <button 
                    onClick={iniciarDisparoHumano} 
                    disabled={executandoAutomacao || stats.pendentes === 0}
                    style={{ background: "#10b981", color: "#fff", border: "none", padding: "8px 14px", borderRadius: 6, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <Play size={14} /> {executandoAutomacao ? "Disparando..." : "Iniciar Disparo Seguro"}
                  </button>
                  <button 
                    onClick={() => carregarFila()} 
                    style={{ background: "#374151", color: "#fff", border: "none", padding: "8px 12px", borderRadius: 6, cursor: "pointer" }}
                    title="Atualizar lista"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>

                <div style={{ display: "flex", gap: 6 }}>
                  <button 
                    onClick={() => handleLimparFila(true)} 
                    style={{ background: "transparent", border: "1px solid #4b5563", color: "#9ca3af", padding: "6px 10px", borderRadius: 6, fontSize: "0.75rem", cursor: "pointer" }}
                  >
                    Limpar Finalizados
                  </button>
                  <button 
                    onClick={() => handleLimparFila(false)} 
                    style={{ background: "transparent", border: "1px solid #7f1d1d", color: "#f87171", padding: "6px 10px", borderRadius: 6, fontSize: "0.75rem", cursor: "pointer" }}
                  >
                    Limpar Tudo
                  </button>
                </div>
              </div>

              {/* Lista de Itens */}
              <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid #1f2937", borderRadius: 8 }}>
                {fila.length === 0 ? (
                  <div style={{ padding: 30, textAlign: "center", color: "#6b7280", fontSize: "0.85rem" }}>
                    Nenhuma mensagem agendada na fila.
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ background: "#1f2937", color: "#9ca3af", textAlign: "left" }}>
                        <th style={{ padding: "8px 12px" }}>Empresa / Telefone</th>
                        <th style={{ padding: "8px 12px" }}>Status</th>
                        <th style={{ padding: "8px 12px" }}>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fila.map(item => (
                        <tr key={item.id} style={{ borderBottom: "1px solid #1f2937", background: indiceAtual === item.id ? "rgba(16, 185, 129, 0.15)" : "transparent" }}>
                          <td style={{ padding: "8px 12px" }}>
                            <div style={{ fontWeight: 600 }}>{item.nome}</div>
                            <div style={{ color: "#9ca3af", fontSize: "0.72rem" }}>{item.telefone}</div>
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            <span style={{ 
                              padding: "2px 6px", borderRadius: 4, fontSize: "0.7rem", fontWeight: 600,
                              background: item.status === "enviado" ? "rgba(16,185,129,0.2)" : item.status === "processando" ? "rgba(59,130,246,0.2)" : "rgba(245,158,11,0.2)",
                              color: item.status === "enviado" ? "#34d399" : item.status === "processando" ? "#60a5fa" : "#fbbf24"
                            }}>
                              {item.status.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            {item.status === "pendente" && (
                              <button 
                                onClick={() => {
                                  const tel = item.telefone.replace(/\D/g, "");
                                  const ddiTel = tel.startsWith("55") ? tel : `55${tel}`;
                                  window.open(`https://wa.me/${ddiTel}?text=${encodeURIComponent(item.mensagem)}`, "_blank");
                                  handleMarcarStatus(item.id, "enviado");
                                }}
                                style={{ background: "#065f46", color: "#34d399", border: "none", padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontSize: "0.72rem" }}
                              >
                                Enviar Agora
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 20px", borderTop: "1px solid #1f2937", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #374151", background: "transparent", color: "#9ca3af", cursor: "pointer" }}>
            Fechar
          </button>
          {tab === "configurar" && (
            <button 
              onClick={handleAdicionarFila} 
              disabled={salvando || leadsSelecionados.length === 0}
              style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#10b981", color: "#fff", fontWeight: 600, cursor: "pointer" }}
            >
              {salvando ? "Agendando..." : `Adicionar ${leadsSelecionados.length} à Fila Segura`}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
