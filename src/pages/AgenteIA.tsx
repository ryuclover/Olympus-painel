import { useState, useEffect } from "react";
import {
  Bot, MessageSquare, Sparkles, Save, CheckCircle2,
  Cpu, PhoneCall, Globe
} from "lucide-react";
import { EntrevistaChatTab } from "../components/agente/EntrevistaChatTab";
import type { MensagemChat } from "../components/agente/types";
import { GuiaVendasTab } from "../components/agente/GuiaVendasTab";
import { WhatsAppTab } from "../components/agente/WhatsAppTab";
import { MotorIATab } from "../components/agente/MotorIATab";
import { IaHunterTab } from "../components/agente/IaHunterTab";
import "./AgenteIA.css";

export function AgenteIA() {
  const [tabAtiva, setTabAtiva] = useState<"whatsapp" | "hunter" | "guia" | "entrevista" | "motor">("whatsapp");

  // Estado do Guia de Vendas
  const [guia, setGuia] = useState<any>({
    empresa_nome: "",
    servicos_oferecidos: "",
    faixa_preco: "",
    formas_pagamento: "",
    nicho_alvo: "",
    dor_principal: "",
    objetivo_conversao: "reuniao",
    dias_horarios_reuniao: "Sexta-feira às 14h ou 16h",
    respostas_prontas: {
      interesse: "",
      preco_caro: "",
      ja_tem_site: "",
      sem_tempo: "",
      fechamento_direto: ""
    }
  });

  // Configurações do Motor e WhatsApp
  const [whatsappAdmin, setWhatsappAdmin] = useState("");
  const [nvidiaKey, setNvidiaKey] = useState("");
  const [nvidiaModel, setNvidiaModel] = useState("nvidia/nemotron-3.5-super-vl-120b-a12b");
  const [provedorPreferido, setProvedorPreferido] = useState("nvidia");

  // Status de Teste
  const [testandoNvidia, setTestandoNvidia] = useState(false);
  const [resultadoTesteNvidia, setResultadoTesteNvidia] = useState<any>(null);
  const [testandoAlertaAdmin, setTestandoAlertaAdmin] = useState(false);
  const [msgAlertaAdmin, setMsgAlertaAdmin] = useState<string | null>(null);

  // Chat da Entrevista
  const [historicoChat, setHistoricoChat] = useState<MensagemChat[]>([]);
  const [inputChat, setInputChat] = useState("");
  const [carregandoRespostaIA, setCarregandoRespostaIA] = useState(false);
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [sucessoSalvar, setSucessoSalvar] = useState(false);

  useEffect(() => {
    carregarConfiguracoes();
  }, []);

  const carregarConfiguracoes = async () => {
    try {
      const resp = await fetch("/api/agente/config");
      const data = await resp.json();
      if (data.guia_vendas) {
        setGuia(data.guia_vendas);
      }
      if (data.whatsapp_admin_notificacao) {
        setWhatsappAdmin(data.whatsapp_admin_notificacao);
      }
      if (data.nvidia_model) {
        setNvidiaModel(data.nvidia_model);
      }
      if (data.provedor_ia_preferido) {
        setProvedorPreferido(data.provedor_ia_preferido);
      }
    } catch (e) {
      console.error("Erro ao carregar configurações do agente:", e);
    }
  };

  const iniciarEntrevista = async () => {
    setCarregandoRespostaIA(true);
    try {
      const resp = await fetch("/api/agente/entrevista", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historico: [], mensagem: "" })
      });
      const data = await resp.json();
      if (data.resposta) {
        setHistoricoChat([{ autor: "bot", texto: data.resposta }]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCarregandoRespostaIA(false);
    }
  };

  const enviarMensagemEntrevista = async () => {
    if (!inputChat.trim() || carregandoRespostaIA) return;
    const texto = inputChat.trim();
    const novoHistorico: MensagemChat[] = [...historicoChat, { autor: "usuario", texto }];
    setHistoricoChat(novoHistorico);
    setInputChat("");
    setCarregandoRespostaIA(true);

    try {
      const resp = await fetch("/api/agente/entrevista", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historico: novoHistorico, mensagem: texto })
      });
      const data = await resp.json();
      if (data.resposta) {
        setHistoricoChat([...novoHistorico, { autor: "bot", texto: data.resposta }]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCarregandoRespostaIA(false);
    }
  };

  const salvarTudo = async () => {
    setSalvandoConfig(true);
    setSucessoSalvar(false);
    try {
      const resp = await fetch("/api/agente/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guia_vendas: guia,
          whatsapp_admin_notificacao: whatsappAdmin,
          provedor_ia_preferido: provedorPreferido,
          nvidia_model: nvidiaModel
        })
      });
      if (resp.ok) {
        setSucessoSalvar(true);
        setTimeout(() => setSucessoSalvar(false), 3000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSalvandoConfig(false);
    }
  };

  const testarNvidia = async () => {
    setTestandoNvidia(true);
    setResultadoTesteNvidia(null);
    try {
      if (nvidiaKey.trim()) {
        await fetch("/api/configuracoes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chave: "nvidia", valor: nvidiaKey.trim() })
        });
      }
      const resp = await fetch("/api/configuracoes/testar-nvidia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelo: nvidiaModel })
      });
      const data = await resp.json();
      setResultadoTesteNvidia(data);
    } catch (e: any) {
      setResultadoTesteNvidia({ ok: false, erro: e.message });
    } finally {
      setTestandoNvidia(false);
    }
  };

  const testarAlertaAdmin = async () => {
    if (!whatsappAdmin.trim()) return;
    setTestandoAlertaAdmin(true);
    setMsgAlertaAdmin(null);
    try {
      const resp = await fetch("/api/whatsapp/testar-alerta-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone: whatsappAdmin.trim() })
      });
      const data = await resp.json();
      setMsgAlertaAdmin(data.mensagem || (data.ok ? "Alerta enviado!" : "Erro ao enviar"));
    } catch (e: any) {
      setMsgAlertaAdmin(`Falha: ${e.message}`);
    } finally {
      setTestandoAlertaAdmin(false);
    }
  };

  return (
    <div className="agente-page">
      <div className="agente-header">
        <div className="agente-title-area">
          <h1>
            <Bot size={28} color="#fbbf24" />
            Agente Autônomo de Vendas (AI SDR)
          </h1>
          <p className="agente-subtitle">
            Configure seu consultor de IA para abordar leads, quebrar objeções e agendar reuniões 24 horas por dia.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div className="agente-badge-status">
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399" }} />
            Motor NVIDIA Nemotron 120B Ativo
          </div>
          <button className="btn-primary" onClick={salvarTudo} disabled={salvandoConfig}>
            <Save size={16} /> {salvandoConfig ? "Salvando..." : "Salvar Configurações"}
          </button>
        </div>
      </div>

      {sucessoSalvar && (
        <div className="status-box-test" style={{ marginBottom: 20 }}>
          <CheckCircle2 size={16} style={{ display: "inline", marginRight: 6 }} />
          Configurações e Guia do Agente salvos com sucesso!
        </div>
      )}

      {/* Navegação entre Abas */}
      <div className="agente-tabs">
        <button
          className={`agente-tab-btn ${tabAtiva === "whatsapp" ? "active" : ""}`}
          onClick={() => setTabAtiva("whatsapp")}
        >
          <PhoneCall size={17} /> WhatsApp Autônomo & Alertas
        </button>
        <button
          className={`agente-tab-btn ${tabAtiva === "hunter" ? "active" : ""}`}
          onClick={() => setTabAtiva("hunter")}
        >
          <Globe size={17} /> Caçador Web IA (Hunter)
        </button>
        <button
          className={`agente-tab-btn ${tabAtiva === "guia" ? "active" : ""}`}
          onClick={() => setTabAtiva("guia")}
        >
          <Sparkles size={17} /> Guia de Vendas & Respostas Prontas
        </button>
        <button
          className={`agente-tab-btn ${tabAtiva === "entrevista" ? "active" : ""}`}
          onClick={() => setTabAtiva("entrevista")}
        >
          <MessageSquare size={17} /> Entrevista Estratégica (Modo IA)
        </button>
        <button
          className={`agente-tab-btn ${tabAtiva === "motor" ? "active" : ""}`}
          onClick={() => setTabAtiva("motor")}
        >
          <Cpu size={17} /> Motor IA (NVIDIA Nemotron)
        </button>
      </div>

      {/* Conteúdo das Abas Modularizadas */}
      {tabAtiva === "whatsapp" && (
        <WhatsAppTab
          whatsappAdmin={whatsappAdmin}
          setWhatsappAdmin={setWhatsappAdmin}
          testarAlertaAdmin={testarAlertaAdmin}
          testandoAlertaAdmin={testandoAlertaAdmin}
          msgAlertaAdmin={msgAlertaAdmin}
          empresaNome={guia.empresa_nome}
          nichoAlvo={guia.nicho_alvo}
        />
      )}

      {tabAtiva === "hunter" && (
        <IaHunterTab
          nichoPadrao={guia.nicho_alvo}
          empresaNome={guia.empresa_nome}
        />
      )}

      {tabAtiva === "guia" && (
        <GuiaVendasTab
          guia={guia}
          setGuia={setGuia}
        />
      )}

      {tabAtiva === "entrevista" && (
        <EntrevistaChatTab
          historicoChat={historicoChat}
          inputChat={inputChat}
          setInputChat={setInputChat}
          carregandoRespostaIA={carregandoRespostaIA}
          iniciarEntrevista={iniciarEntrevista}
          enviarMensagemEntrevista={enviarMensagemEntrevista}
        />
      )}

      {tabAtiva === "motor" && (
        <MotorIATab
          nvidiaKey={nvidiaKey}
          setNvidiaKey={setNvidiaKey}
          nvidiaModel={nvidiaModel}
          setNvidiaModel={setNvidiaModel}
          testarNvidia={testarNvidia}
          testandoNvidia={testandoNvidia}
          resultadoTesteNvidia={resultadoTesteNvidia}
        />
      )}
    </div>
  );
}
