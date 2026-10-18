import { useState, useRef, useEffect } from "react";
import {
  MessageSquare, Send, RotateCcw, Smartphone, CheckCircle2,
  AlertCircle, Calendar, Sparkles, User, Bot, Clock, Zap
} from "lucide-react";

interface MensagemSimulacao {
  id: string;
  autor: "usuario" | "bot";
  texto: string;
  enviadaEm: string;
  analise?: {
    estagio?: string;
    intencao_detectada?: string;
    objecao_identificada?: string;
  };
  reuniao?: {
    detectada: boolean;
    data_sugerida?: string;
    horario_sugerido?: string;
  };
}

interface SimuladorChatIAProps {
  telefoneAdmin: string;
  empresaNome?: string;
  nichoAlvo?: string;
}

export function SimuladorChatIA({ telefoneAdmin, empresaNome, nichoAlvo }: SimuladorChatIAProps) {
  const nomeExibicao = (empresaNome || "Sua Empresa").trim();

  const presetsExemplos = [
    {
      rotulo: "💰 Pergunta de Preço",
      texto: `Olá! Vi a solução da ${nomeExibicao}. Quanto custa o serviço/sistema para a nossa operação?`
    },
    {
      rotulo: "🙅 Objeção: Já tenho fornecedor / sem tempo",
      texto: "Já temos alguém cuidando disso aqui internamente e estamos sem tempo para reuniões agora."
    },
    {
      rotulo: "🎯 Pergunta de Nicho",
      texto: `Vocês atendem empresas do nosso segmento (${nichoAlvo || "empresas locais"})? Como funciona na prática?`
    },
    {
      rotulo: "📅 Fechar Demonstração / Reunião",
      texto: "Gostei da proposta! Vocês conseguem fazer uma demonstração rápida nesta semana?"
    },
    {
      rotulo: "🛑 Recusa Clara (Desistir com Elegância)",
      texto: "Não tenho nenhum interesse nisso no momento, favor não insistir."
    }
  ];

  const [mensagens, setMensagens] = useState<MensagemSimulacao[]>([
    {
      id: "inicio",
      autor: "bot",
      texto: `Olá! Aqui é o consultor virtual da ${nomeExibicao}. Como posso ajudar a otimizar o atendimento e os resultados do seu negócio hoje?`,
      enviadaEm: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }
  ]);

  useEffect(() => {
    setMensagens(prev => {
      if (prev.length === 1 && prev[0].id === "inicio") {
        return [{
          id: "inicio",
          autor: "bot",
          texto: `Olá! Aqui é o consultor virtual da ${nomeExibicao}. Como posso ajudar a otimizar o atendimento e os resultados do seu negócio hoje?`,
          enviadaEm: prev[0].enviadaEm
        }];
      }
      return prev;
    });
  }, [nomeExibicao]);

  const [inputTexto, setInputTexto] = useState("");
  const [carregandoIA, setCarregandoIA] = useState(false);
  const [enviandoWhatsId, setEnviandoWhatsId] = useState<string | null>(null);
  const [notificacaoEnvio, setNotificacaoEnvio] = useState<string | null>(null);

  // Buffer de espera para mensagens em sequência (debounce humano)
  const [bufferAtivo, setBufferAtivo] = useState(true);
  const [segundosRestantes, setSegundosRestantes] = useState<number | null>(null);

  const debounceTimerRef = useRef<any>(null);
  const countdownIntervalRef = useRef<any>(null);
  const mensagensRef = useRef<MensagemSimulacao[]>(mensagens);
  mensagensRef.current = mensagens;

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, carregandoIA, segundosRestantes]);

  // Limpa timers ao desmontar
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  const limparTimers = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setSegundosRestantes(null);
  };

  const executarChamadaIA = async (historicoParaEnviar: MensagemSimulacao[]) => {
    limparTimers();
    setCarregandoIA(true);

    try {
      // Converte para formato esperado pelo endpoint
      const historicoPayload = historicoParaEnviar.map(m => ({
        autor: m.autor === "usuario" ? "lead" : "bot",
        texto: m.texto,
        enviada_em: m.enviadaEm
      }));

      // Extrai o texto do turno recente do lead
      const ultimasLead = historicoParaEnviar
        .filter(m => m.autor === "usuario")
        .slice(-3)
        .map(m => m.texto)
        .join(" \n");

      const resp = await fetch("/api/whatsapp/simular-interacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telefone: telefoneAdmin || "21983811968",
          texto: ultimasLead,
          historico: historicoPayload,
          enviar_whatsapp: false
        })
      });

      const data = await resp.json();

      if (data.ok && data.resposta_ia) {
        const novaMsgBot: MensagemSimulacao = {
          id: "bot_" + Date.now(),
          autor: "bot",
          texto: data.resposta_ia,
          enviadaEm: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          analise: data.analise,
          reuniao: data.reuniao_detectada
        };
        setMensagens([...historicoParaEnviar, novaMsgBot]);
      } else {
        const msgErro: MensagemSimulacao = {
          id: "erro_" + Date.now(),
          autor: "bot",
          texto: `[Falha na resposta do modelo: ${data.erro || "Sem resposta"}]`,
          enviadaEm: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        };
        setMensagens([...historicoParaEnviar, msgErro]);
      }
    } catch (e: any) {
      const msgErro: MensagemSimulacao = {
        id: "erro_" + Date.now(),
        autor: "bot",
        texto: `[Erro de conexão: ${e.message}]`,
        enviadaEm: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };
      setMensagens([...historicoParaEnviar, msgErro]);
    } finally {
      setCarregandoIA(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleEnviar = (textoParaEnviar?: string) => {
    const texto = (textoParaEnviar || inputTexto).trim();
    if (!texto || carregandoIA) return;

    const novaMsgUsuario: MensagemSimulacao = {
      id: "msg_" + Date.now(),
      autor: "usuario",
      texto,
      enviadaEm: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    const novoHistorico = [...mensagensRef.current, novaMsgUsuario];
    setMensagens(novoHistorico);
    setInputTexto("");

    if (!bufferAtivo) {
      // Disparo imediato se o buffer estiver desativado
      executarChamadaIA(novoHistorico);
      return;
    }

    // Se o buffer estiver ativo: reseta timers e inicia contagem regressiva de 3.5 segundos
    limparTimers();
    let tempo = 3;
    setSegundosRestantes(tempo);

    countdownIntervalRef.current = setInterval(() => {
      tempo -= 1;
      if (tempo > 0) {
        setSegundosRestantes(tempo);
      } else {
        setSegundosRestantes(null);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      }
    }, 1000);

    debounceTimerRef.current = setTimeout(() => {
      executarChamadaIA(mensagensRef.current);
    }, 3500);

    // Mantém o input focado para permitir enviar mais mensagens rapidamente
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Simula o envio de 3 mensagens picadas em sequência
  const simularMensagensPicadas = () => {
    if (carregandoIA) return;
    limparTimers();

    const frases = [
      "Olá! Tudo bem?",
      "Vi o trabalho de vocês na internet",
      "Queria saber quanto fica o valor para a minha clínica?"
    ];

    frases.forEach((f, i) => {
      setTimeout(() => {
        handleEnviar(f);
      }, i * 1100);
    });
  };

  const handleEnviarParaMeuWhatsApp = async (textoMsg: string, msgId: string) => {
    setEnviandoWhatsId(msgId);
    setNotificacaoEnvio(null);
    try {
      const resp = await fetch("/api/whatsapp/enviar-mensagem-direta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telefone: telefoneAdmin || "21983811968",
          texto: textoMsg
        })
      });
      const data = await resp.json();
      if (data.ok) {
        setNotificacaoEnvio("✅ Mensagem enviada com sucesso para seu WhatsApp (" + (telefoneAdmin || "21983811968") + ")!");
        setTimeout(() => setNotificacaoEnvio(null), 4000);
      } else {
        setNotificacaoEnvio("⚠️ Erro: " + (data.erro || "Falha no envio"));
      }
    } catch (e: any) {
      setNotificacaoEnvio("❌ Erro ao enviar: " + e.message);
    } finally {
      setEnviandoWhatsId(null);
    }
  };

  const reiniciarSimulacao = () => {
    limparTimers();
    setMensagens([
      {
        id: "inicio",
        autor: "bot",
        texto: `Olá! Aqui é o consultor virtual da ${nomeExibicao}. Como posso ajudar a otimizar o atendimento e os resultados do seu negócio hoje?`,
        enviadaEm: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      }
    ]);
  };

  return (
    <div className="agente-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 className="agente-card-title">
            <MessageSquare size={20} color="#fbbf24" />
            Simulador Interativo: Converse com a IA (Roleplay de Vendas)
          </h2>
          <p className="agente-card-desc" style={{ marginBottom: 8 }}>
            Converse com o agente como se você fosse um cliente real. A IA aguarda mensagens quebradas em sequência e formula uma resposta coesa para todas elas.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <div className="simulador-safe-badge">
              <span className="dot-green" />
              <span>Modo Seguro: <strong>Simulação local (sem disparos externos)</strong></span>
            </div>

            {/* Controle de Buffer / Mensagens Quebradas */}
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: "0.78rem",
                cursor: "pointer",
                padding: "3px 8px",
                borderRadius: 4,
                background: bufferAtivo ? "rgba(99, 102, 241, 0.12)" : "rgba(255, 255, 255, 0.05)",
                border: `1px solid ${bufferAtivo ? "#6366f1" : "rgba(255, 255, 255, 0.1)"}`,
                color: bufferAtivo ? "#a5b4fc" : "var(--text-muted)"
              }}
              title="A IA aguarda alguns segundos para você mandar várias mensagens picadas antes de responder"
            >
              <input
                type="checkbox"
                checked={bufferAtivo}
                onChange={(e) => {
                  setBufferAtivo(e.target.checked);
                  limparTimers();
                }}
              />
              <Clock size={12} />
              <span>Buffer de Mensagens Picadas (3.5s)</span>
            </label>
          </div>
        </div>

        <button className="btn-secondary" onClick={reiniciarSimulacao} title="Reiniciar Conversa">
          <RotateCcw size={15} />
          Reiniciar
        </button>
      </div>

      {/* Sugestões de Mensagens para Teste Rápido */}
      <div className="simulador-presets">
        <span className="presets-label">Exemplos rápidos de clientes:</span>
        <div className="presets-list">
          {presetsExemplos.map((ex, idx) => (
            <button
              key={idx}
              className="preset-pill"
              onClick={() => handleEnviar(ex.texto)}
              disabled={carregandoIA}
            >
              {ex.rotulo}
            </button>
          ))}

          {/* Botão Especial de Teste de Mensagens Picadas */}
          <button
            className="preset-pill"
            onClick={simularMensagensPicadas}
            disabled={carregandoIA}
            style={{ background: "rgba(99, 102, 241, 0.18)", borderColor: "#6366f1", color: "#c7d2fe" }}
            title="Envia 3 mensagens curtas seguidas para testar a espera do robô"
          >
            <Zap size={12} style={{ display: "inline", marginRight: 4 }} />
            ⚡ Testar 3 Mensagens Picadas em Sequência
          </button>
        </div>
      </div>

      {/* Notificação Flutuante de Envio */}
      {notificacaoEnvio && (
        <div className="simulador-toast">
          {notificacaoEnvio}
        </div>
      )}

      {/* Caixa de Mensagens do Chat */}
      <div className="simulador-chat-box">
        {mensagens.map((msg) => (
          <div key={msg.id} className={`simulador-msg-row ${msg.autor}`}>
            <div className="msg-avatar">
              {msg.autor === "usuario" ? <User size={16} /> : <Bot size={16} />}
            </div>

            <div className="msg-content-wrapper">
              <div className="msg-header-info">
                <span className="msg-author-name">
                  {msg.autor === "usuario" ? "Você (Cliente Simulado)" : `Agente ${nomeExibicao} (IA Nemotron)`}
                </span>
                <span className="msg-time">{msg.enviadaEm}</span>
              </div>

              <div className="msg-text-bubble">
                {msg.texto}
              </div>

              {/* Badges e Ações da Mensagem da IA */}
              {msg.autor === "bot" && msg.id !== "inicio" && (
                <div className="msg-actions-bar">
                  {msg.reuniao?.detectada && (
                    <div className="reuniao-detected-badge">
                      <Calendar size={14} />
                      <span>Reunião Detectada: <strong>{msg.reuniao.data_sugerida} às {msg.reuniao.horario_sugerido}</strong></span>
                    </div>
                  )}

                  {msg.analise?.estagio && (
                    <span className="etapa-pill">
                      Etapa: <strong>{msg.analise.estagio}</strong>
                    </span>
                  )}

                  <button
                    className="btn-send-whatsapp-preview"
                    onClick={() => handleEnviarParaMeuWhatsApp(msg.texto, msg.id)}
                    disabled={enviandoWhatsId === msg.id}
                  >
                    <Smartphone size={13} />
                    {enviandoWhatsId === msg.id ? "Enviando para seu WhatsApp..." : "📲 Enviar esta mensagem para meu WhatsApp"}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Indicador de Espera / Debounce de Digitação */}
        {segundosRestantes !== null && !carregandoIA && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 14px",
              borderRadius: 6,
              background: "rgba(99, 102, 241, 0.12)",
              border: "1px solid rgba(99, 102, 241, 0.3)",
              fontSize: "0.82rem",
              color: "#c7d2fe",
              margin: "6px 0"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Clock size={15} className="spin" color="#818cf8" />
              <span>
                Aguardando cliente terminar de mandar mensagens (<strong>{segundosRestantes}s</strong>)...
              </span>
            </div>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: "0.74rem", padding: "3px 8px", borderColor: "#6366f1", color: "#e0e7ff" }}
              onClick={() => executarChamadaIA(mensagensRef.current)}
            >
              <Zap size={12} style={{ marginRight: 3 }} />
              Responder Agora
            </button>
          </div>
        )}

        {carregandoIA && (
          <div className="simulador-msg-row bot">
            <div className="msg-avatar">
              <Bot size={16} />
            </div>
            <div className="msg-content-wrapper">
              <div className="msg-text-bubble thinking">
                <Sparkles size={14} className="spin" color="#fbbf24" />
                <span>Agente analisando todas as mensagens recebidas e formulando resposta única...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input de Digitação */}
      <div className="simulador-input-bar">
        <input
          ref={inputRef}
          type="text"
          className="simulador-input"
          placeholder={segundosRestantes !== null ? "Pode mandar mais mensagens antes da IA responder..." : "Digite sua fala (pode mandar várias mensagens picadas)..."}
          value={inputTexto}
          onChange={(e) => setInputTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleEnviar()}
          disabled={carregandoIA}
        />
        <button
          className="btn-primary"
          onClick={() => handleEnviar()}
          disabled={carregandoIA || !inputTexto.trim()}
        >
          <Send size={16} />
          Enviar
        </button>
      </div>
    </div>
  );
}
