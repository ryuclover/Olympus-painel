import { useState, useEffect, useRef } from "react";
import {
  PhoneCall, CheckCircle2, AlertCircle, RefreshCw,
  Power, Zap, ShieldCheck, ShieldAlert, Trash2
} from "lucide-react";

import type { WhatsAppStatus } from "./types";
import { SimuladorChatIA } from "./SimuladorChatIA";
import { DisparoAlvoCard } from "./DisparoAlvoCard";

interface WhatsAppTabProps {
  whatsappAdmin: string;
  setWhatsappAdmin: (tel: string) => void;
  testarAlertaAdmin: () => void;
  testandoAlertaAdmin: boolean;
  msgAlertaAdmin: string | null;
  empresaNome?: string;
  nichoAlvo?: string;
}

export function WhatsAppTab({
  whatsappAdmin,
  setWhatsappAdmin,
  testarAlertaAdmin,
  testandoAlertaAdmin,
  msgAlertaAdmin,
  empresaNome,
  nichoAlvo
}: WhatsAppTabProps) {
  const [status, setStatus] = useState<WhatsAppStatus>({
    ativo: false,
    conectado: false,
    tem_qr: false,
    qr_base64: null,
    telefone_conectado: null,
    ultima_atividade: null,
    erro: null,
    total_fila_pendente: 0,
    envio_automatico: false
  });

  const [carregandoStatus, setCarregandoStatus] = useState(false);
  const [iniciandoSessao, setIniciandoSessao] = useState(false);
  const [parandoSessao, setParandoSessao] = useState(false);
  const [limpandoFila, setLimpandoFila] = useState(false);
  const [togglingEnvio, setTogglingEnvio] = useState(false);

  const pollingRef = useRef<any>(null);

  useEffect(() => {
    carregarStatus();
    iniciarPolling();
    return () => pararPolling();
  }, []);

  const carregarStatus = async () => {
    try {
      setCarregandoStatus(true);
      const resp = await fetch("/api/whatsapp/status");
      if (resp.ok) {
        const dados = await resp.json();
        setStatus(dados);
      }
    } catch (e) {
      console.error("Erro ao carregar status do WhatsApp:", e);
    } finally {
      setCarregandoStatus(false);
    }
  };

  const iniciarPolling = () => {
    pararPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const resp = await fetch("/api/whatsapp/status");
        if (resp.ok) {
          const dados = await resp.json();
          setStatus(dados);
        }
      } catch (e) {
        // Silencioso em caso de erro no polling
      }
    }, 3000);
  };

  const pararPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const handleIniciarWhatsApp = async () => {
    setIniciandoSessao(true);
    try {
      const resp = await fetch("/api/whatsapp/iniciar", { method: "POST" });
      const data = await resp.json();
      if (data.estado) {
        setStatus(data.estado);
      }
      await carregarStatus();
    } catch (e) {
      console.error("Erro ao iniciar WhatsApp:", e);
    } finally {
      setIniciandoSessao(false);
    }
  };

  const handlePararWhatsApp = async () => {
    if (!confirm("Deseja realmente desconectar o WhatsApp Web?")) return;
    setParandoSessao(true);
    try {
      const resp = await fetch("/api/whatsapp/parar", { method: "POST" });
      const data = await resp.json();
      if (data.estado) {
        setStatus(data.estado);
      }
      await carregarStatus();
    } catch (e) {
      console.error("Erro ao parar WhatsApp:", e);
    } finally {
      setParandoSessao(false);
    }
  };

  const handleToggleEnvioAuto = async () => {
    const novoStatus = !status.envio_automatico;
    if (novoStatus && !confirm("Atenção: Ao ativar o Envio Automático, mensagens pendentes na fila serão enviadas pelo WhatsApp conectado. Deseja continuar?")) {
      return;
    }
    setTogglingEnvio(true);
    try {
      await fetch("/api/whatsapp/toggle-envio-automatico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: novoStatus })
      });
      await carregarStatus();
    } catch (e) {
      console.error("Erro ao alternar envio automático:", e);
    } finally {
      setTogglingEnvio(false);
    }
  };

  const handleLimparFila = async () => {
    if (!confirm("Deseja cancelar todas as mensagens pendentes na fila? Elas não serão enviadas.")) return;
    setLimpandoFila(true);
    try {
      await fetch("/api/whatsapp/limpar-fila", { method: "POST" });
      await carregarStatus();
    } catch (e) {
      console.error("Erro ao limpar fila:", e);
    } finally {
      setLimpandoFila(false);
    }
  };

  return (
    <div className="whatsapp-tab-container">
      {/* CARD 1: Status de Conexão WhatsApp Web & Trava de Segurança */}
      <div className="agente-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 className="agente-card-title">
              <PhoneCall size={20} color="#fbbf24" />
              Conexão WhatsApp Web (Playwright Nativo)
            </h2>
            <p className="agente-card-desc">
              Conecte seu WhatsApp real escaneando o QR Code abaixo. A sessão é persistente em cache local (sem cobranças de API externa).
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn-secondary" onClick={carregarStatus} disabled={carregandoStatus} title="Atualizar status">
              <RefreshCw size={15} className={carregandoStatus ? "spin" : ""} />
              Atualizar
            </button>

            {status.ativo ? (
              <button className="btn-secondary" onClick={handlePararWhatsApp} disabled={parandoSessao} style={{ borderColor: "#ef4444", color: "#f87171" }}>
                <Power size={15} />
                {parandoSessao ? "Desconectando..." : "Desconectar"}
              </button>
            ) : (
              <button className="btn-primary" onClick={handleIniciarWhatsApp} disabled={iniciandoSessao}>
                <Power size={15} />
                {iniciandoSessao ? "Iniciando..." : "Conectar WhatsApp"}
              </button>
            )}
          </div>
        </div>

        {/* Banner de Estado */}
        <div style={{ marginTop: 12 }}>
          {status.conectado ? (
            <div className="wa-status-banner connected">
              <CheckCircle2 size={22} color="#10b981" />
              <div>
                <strong>WhatsApp Conectado e Operando!</strong>
                <p>Navegador autenticado com sucesso. Sessão salva em <code>data/whatsapp_web_session</code>.</p>
              </div>
            </div>
          ) : status.tem_qr && status.qr_base64 ? (
            <div className="wa-status-banner waiting-qr">
              <div className="spin-dot" />
              <div>
                <strong>Aguardando Leitura do QR Code</strong>
                <p>Abra o WhatsApp no seu celular, vá em Aparelhos Conectados e aponte a câmera para a imagem abaixo.</p>
              </div>
            </div>
          ) : status.ativo ? (
            <div className="wa-status-banner starting">
              <RefreshCw size={18} className="spin" color="#38bdf8" />
              <div>
                <strong>Iniciando Navegador Chromium...</strong>
                <p>Carregando web.whatsapp.com e gerando o QR Code ao vivo. Aguarde alguns instantes.</p>
              </div>
            </div>
          ) : (
            <div className="wa-status-banner disconnected">
              <AlertCircle size={20} color="#9ca3af" />
              <div>
                <strong>WhatsApp Desconectado</strong>
                <p>Clique em <strong>"Conectar WhatsApp"</strong> para inicializar o navegador e parear seu aparelho.</p>
              </div>
            </div>
          )}
        </div>

        {/* QR CODE DISPLAY */}
        {status.tem_qr && status.qr_base64 && !status.conectado && (
          <div className="wa-qr-box">
            <div className="wa-qr-img-wrap">
              <img src={status.qr_base64} alt="QR Code WhatsApp Web" className="wa-qr-image" />
            </div>
            <div className="wa-qr-instructions">
              <h4>Como Conectar seu Telefone:</h4>
              <ol>
                <li>Abra o aplicativo <strong>WhatsApp</strong> no seu telefone.</li>
                <li>Toque no menu de <strong>Configurações</strong> (ou nos 3 pontinhos no canto superior).</li>
                <li>Toque em <strong>Aparelhos Conectados</strong> e depois em <strong>Conectar um aparelho</strong>.</li>
                <li>Aponte a câmera do celular para este código na tela.</li>
              </ol>
              <div className="wa-qr-tip">
                <Zap size={15} color="#fbbf24" />
                <span>Após conectar, a sessão fica salva em <code>data/whatsapp_web_session</code>. Você não precisará escanear de novo.</span>
              </div>
            </div>
          </div>
        )}

        {/* Métricas e Fila */}
        <div className="wa-metrics-row">
          <div className="wa-metric-card">
            <span className="wa-metric-label">Status da Conexão</span>
            <span className={`wa-metric-value ${status.conectado ? "online" : "offline"}`}>
              {status.conectado ? "Online" : status.ativo ? "Iniciando" : "Offline"}
            </span>
          </div>
          <div className="wa-metric-card">
            <span className="wa-metric-label">Mensagens Pendentes na Fila</span>
            <span className="wa-metric-value">{status.total_fila_pendente || 0} pendentes</span>
          </div>
          <div className="wa-metric-card">
            <span className="wa-metric-label">Envio Automático da Fila</span>
            <span className={`wa-metric-value ${status.envio_automatico ? "online" : "offline"}`}>
              {status.envio_automatico ? "Ativado" : "Pausado (Seguro)"}
            </span>
          </div>
        </div>

        {/* Painel de Segurança da Fila */}
        <div className="wa-safety-panel">
          <div className="wa-safety-info">
            {status.envio_automatico ? (
              <ShieldAlert size={22} color="#fbbf24" />
            ) : (
              <ShieldCheck size={22} color="#10b981" />
            )}
            <div>
              <div className="wa-safety-title">
                {status.envio_automatico ? (
                  <span style={{ color: "#fbbf24" }}>Modo Despacho Automático Ligado</span>
                ) : (
                  <span style={{ color: "#34d399" }}>Modo Seguro Ativo (Envio Automático Pausado)</span>
                )}
              </div>
              <p className="wa-safety-desc">
                {status.envio_automatico
                  ? "O robô enviará automaticamente todas as mensagens da fila. Pause quando quiser apenas simular."
                  : "Nenhuma mensagem pendente será enviada automaticamente ao conectar. O robô só enviará o que você pedir manualmente."}
              </p>
            </div>
          </div>

          <div className="wa-safety-actions">
            <button
              className="btn-secondary"
              onClick={handleToggleEnvioAuto}
              disabled={togglingEnvio}
              style={{
                borderColor: status.envio_automatico ? "#f59e0b" : "#10b981",
                color: status.envio_automatico ? "#fbbf24" : "#34d399"
              }}
            >
              {status.envio_automatico ? "Pausar Envio Automático" : "Ativar Envio Automático"}
            </button>

            {(status.total_fila_pendente || 0) > 0 && (
              <button
                className="btn-secondary"
                onClick={handleLimparFila}
                disabled={limpandoFila}
                style={{ borderColor: "#ef4444", color: "#f87171" }}
                title="Cancela todas as mensagens pendentes na fila"
              >
                <Trash2 size={14} />
                Limpar Fila ({status.total_fila_pendente})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CARD 2: Disparo Direto de Conversa com IA (Número Alvo) */}
      <DisparoAlvoCard
        telefonePadrao={whatsappAdmin || "21983811968"}
        whatsappConectado={status.conectado}
        empresaNome={empresaNome}
        nichoPadrao={nichoAlvo}
      />

      {/* CARD 3: Simulador Interativo com a IA falando comigo mesmo */}
      <SimuladorChatIA
        telefoneAdmin={whatsappAdmin || "21983811968"}
        empresaNome={empresaNome}
        nichoAlvo={nichoAlvo}
      />

      {/* CARD 3: Alertas de Reunião para o Dono */}
      <div className="agente-card">
        <h2 className="agente-card-title">
          <Zap size={20} color="#fbbf24" />
          Notificações Instantâneas de Reunião Fechada
        </h2>
        <p className="agente-card-desc">
          Configure seu número de WhatsApp pessoal para receber um aviso no exato segundo em que o agente marcar uma reunião com qualquer lead.
        </p>

        <div className="form-group" style={{ maxWidth: 520 }}>
          <label className="form-label">Seu WhatsApp Pessoal (com DDD) para receber alertas</label>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              type="text"
              className="form-input"
              placeholder="Ex: 21983811968"
              value={whatsappAdmin}
              onChange={(e) => setWhatsappAdmin(e.target.value)}
            />
            <button className="btn-secondary" onClick={testarAlertaAdmin} disabled={testandoAlertaAdmin || !whatsappAdmin}>
              {testandoAlertaAdmin ? "Enviando..." : "Testar Alerta"}
            </button>
          </div>
        </div>

        {msgAlertaAdmin && (
          <div className="status-box-test" style={{ maxWidth: 520 }}>
            {msgAlertaAdmin}
          </div>
        )}
      </div>
    </div>
  );
}
