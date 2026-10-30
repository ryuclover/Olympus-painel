import { useState } from "react";
import {
  Send, Sparkles, PhoneCall, CheckCircle2, AlertCircle,
  Building, User, MessageSquare
} from "lucide-react";

interface DisparoAlvoCardProps {
  telefonePadrao?: string;
  whatsappConectado: boolean;
  empresaNome?: string;
  nichoPadrao?: string;
}

export function DisparoAlvoCard({
  telefonePadrao,
  whatsappConectado,
  empresaNome,
  nichoPadrao
}: DisparoAlvoCardProps) {
  const nomeExibicao = (empresaNome || "Sua Empresa").trim();
  const [telefone, setTelefone] = useState(telefonePadrao || "");
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState(nichoPadrao || "Negócio Local");
  const [mensagem, setMensagem] = useState(
    `Olá! Acompanho o trabalho de vocês e gostaria de apresentar como a ${nomeExibicao} pode ajudar a otimizar seus processos e gerar mais resultados. Você teria 15 minutos nesta semana para conversarmos?`
  );

  const [gerandoIA, setGerandoIA] = useState(false);
  const [disparando, setDisparando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  const handleGerarAbordagemComIA = async () => {
    if (!telefone.trim()) {
      alert("Por favor, digite o número de telefone alvo primeiro.");
      return;
    }
    setGerandoIA(true);
    setResultado(null);
    try {
      const resp = await fetch("/api/whatsapp/gerar-abordagem-alvo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telefone: telefone.trim(),
          nome: nome.trim(),
          categoria: categoria.trim()
        })
      });
      const data = await resp.json();
      if (data.ok && data.mensagem) {
        setMensagem(data.mensagem);
      } else {
        alert("Não foi possível gerar a abordagem com a IA: " + (data.erro || "Tente novamente"));
      }
    } catch (e: any) {
      alert("Erro ao conectar com a IA: " + e.message);
    } finally {
      setGerandoIA(false);
    }
  };

  const handleDispararConversa = async () => {
    if (!telefone.trim() || !mensagem.trim()) {
      alert("Informe o telefone de destino e a mensagem inicial.");
      return;
    }
    setDisparando(true);
    setResultado(null);
    try {
      const resp = await fetch("/api/whatsapp/iniciar-conversa-alvo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telefone: telefone.trim(),
          nome: nome.trim(),
          categoria: categoria.trim(),
          mensagem: mensagem.trim()
        })
      });
      const data = await resp.json();
      setResultado(data);
    } catch (e: any) {
      setResultado({ ok: false, erro: e.message });
    } finally {
      setDisparando(false);
    }
  };

  return (
    <div className="agente-card disparo-alvo-card">
      <div className="disparo-alvo-header">
        <div>
          <h2 className="agente-card-title">
            <Send size={20} color="#fbbf24" />
            Disparo Direto de Conversa com IA (Número Alvo)
          </h2>
          <p className="agente-card-desc" style={{ marginBottom: 4 }}>
            Inicie uma abordagem ativa com o robô de vendas da <strong>{nomeExibicao}</strong> direcionada para qualquer número de WhatsApp que você preencher.
          </p>
          <small style={{ color: "#9ca3af" }}>
            Assim que a pessoa responder no WhatsApp, o agente assume a conversa 100% no piloto automático.
          </small>
        </div>

        <div className={`disparo-wa-indicator ${whatsappConectado ? "online" : "offline"}`}>
          <span className="dot" />
          <span>{whatsappConectado ? "WhatsApp Web Conectado" : "WhatsApp Web Desconectado"}</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr 1.4fr", gap: 14, margin: "16px 0" }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <PhoneCall size={14} color="#fbbf24" />
            WhatsApp Alvo (com DDD) *
          </label>
          <input
            type="text"
            className="form-input"
            placeholder="Ex: 21983811968"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
          />
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <User size={14} color="#fbbf24" />
            Nome do Contato (opcional)
          </label>
          <input
            type="text"
            className="form-input"
            placeholder="Ex: Dr. Marcelo / Clínica Saúde"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Building size={14} color="#fbbf24" />
            Ramo / Especialidade
          </label>
          <input
            type="text"
            className="form-input"
            placeholder="Ex: Clínica Odontológica, Laboratório"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          />
        </div>
      </div>

      {/* Caixa de Mensagem Inicial */}
      <div className="form-group" style={{ marginTop: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <label className="form-label" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <MessageSquare size={14} color="#fbbf24" />
            Primeira Mensagem de Abordagem
          </label>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={handleGerarAbordagemComIA}
            disabled={gerandoIA || !telefone.trim()}
            style={{ fontSize: "0.8rem", padding: "4px 12px" }}
          >
            <Sparkles size={14} color="#fbbf24" />
            {gerandoIA ? "Gerando com Nemotron 120B..." : "Gerar Pitch Personalizado com IA"}
          </button>
        </div>

        <textarea
          className="resposta-textarea"
          rows={4}
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          placeholder="Digite a mensagem inicial de abordagem ou clique em Gerar Pitch..."
        />
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14 }}>
        <button
          className="btn-primary"
          onClick={handleDispararConversa}
          disabled={disparando || !telefone.trim() || !mensagem.trim()}
        >
          <Send size={16} />
          {disparando ? "Disparando pelo WhatsApp Web..." : "Disparar Conversa com IA para este Número"}
        </button>

        <span style={{ fontSize: "0.82rem", color: "#9ca3af" }}>
          O lead será salvo automaticamente no CRM com status <strong>"abordado"</strong>.
        </span>
      </div>

      {/* Resultado do Disparo */}
      {resultado && (
        <div
          className="status-box-test"
          style={{
            marginTop: 16,
            background: resultado.ok ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
            borderColor: resultado.ok ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)",
            color: resultado.ok ? "#34d399" : "#f87171"
          }}
        >
          {resultado.ok ? (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <CheckCircle2 size={18} style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <strong>🚀 Disparo Concluído!</strong>
                <p style={{ margin: "4px 0 0 0", fontSize: "0.88rem", color: "#d1fae5" }}>
                  {resultado.status} Destino: <strong>+{resultado.telefone}</strong>. Quando responderem no WhatsApp, a IA continuará o diálogo automaticamente.
                </p>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <AlertCircle size={18} />
              <span><strong>Falha no disparo:</strong> {resultado.erro}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
