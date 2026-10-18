import { Bot, MessageSquare, Sparkles, Send, RotateCcw } from "lucide-react";
import type { MensagemChat } from "./types";

interface EntrevistaChatTabProps {
  historicoChat: MensagemChat[];
  inputChat: string;
  setInputChat: (txt: string) => void;
  carregandoRespostaIA: boolean;
  iniciarEntrevista: () => void;
  enviarMensagemEntrevista: () => void;
}

export function EntrevistaChatTab({
  historicoChat,
  inputChat,
  setInputChat,
  carregandoRespostaIA,
  iniciarEntrevista,
  enviarMensagemEntrevista
}: EntrevistaChatTabProps) {
  return (
    <div className="agente-card">
      <h2 className="agente-card-title">
        <MessageSquare size={20} color="#fbbf24" />
        Entrevista Estratégica do Negócio
      </h2>
      <p className="agente-card-desc">
        Converse com a IA para ela entender seus serviços, preços e tom de conversa. As respostas serão compiladas diretamente no Guia de Vendas do seu robô.
      </p>

      {historicoChat.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <Bot size={48} color="#d97706" style={{ margin: "0 auto 16px auto" }} />
          <h3 style={{ margin: "0 0 8px 0" }}>Pronto para calibrar seu Agente?</h3>
          <p style={{ color: "#9ca3af", maxWidth: 480, margin: "0 auto 20px auto" }}>
            A IA fará perguntas rápidas sobre o que você vende, faixa de preço e como prefere conduzir o fechamento das reuniões.
          </p>
          <button className="btn-primary" onClick={iniciarEntrevista} disabled={carregandoRespostaIA}>
            <Sparkles size={16} /> Iniciar Entrevista com a IA
          </button>
        </div>
      ) : (
        <>
          <div className="chat-box">
            {historicoChat.map((msg, idx) => (
              <div key={idx} className={`chat-bubble ${msg.autor}`}>
                {msg.texto}
              </div>
            ))}
            {carregandoRespostaIA && (
              <div className="chat-bubble bot">
                <span style={{ opacity: 0.7 }}>Pensando na estratégia com Nemotron...</span>
              </div>
            )}
          </div>
          <div className="chat-input-area">
            <input
              type="text"
              className="chat-input"
              placeholder="Digite sua resposta aqui..."
              value={inputChat}
              onChange={(e) => setInputChat(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enviarMensagemEntrevista()}
            />
            <button className="btn-primary" onClick={enviarMensagemEntrevista} disabled={carregandoRespostaIA}>
              <Send size={16} /> Enviar
            </button>
            <button className="btn-secondary" onClick={iniciarEntrevista} title="Reiniciar Entrevista">
              <RotateCcw size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
