import { Sparkles } from "lucide-react";

interface GuiaVendasTabProps {
  guia: any;
  setGuia: (guia: any) => void;
}

export function GuiaVendasTab({ guia, setGuia }: GuiaVendasTabProps) {
  return (
    <div className="agente-card">
      <h2 className="agente-card-title">
        <Sparkles size={20} color="#fbbf24" />
        Guia de Vendas & Matriz de Respostas Prontas
      </h2>
      <p className="agente-card-desc">
        Estas informações são utilizadas pelo modelo de IA para responder clientes, contornar objeções e sugerir datas de reunião no WhatsApp.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="form-group">
          <label className="form-label">Nome da sua Agência / Especialidade</label>
          <input
            type="text"
            className="form-input"
            value={guia.empresa_nome || ""}
            onChange={(e) => setGuia({ ...guia, empresa_nome: e.target.value })}
            placeholder="Ex: Nome da sua Empresa / Especialidade"
          />
        </div>
        <div className="form-group">
          <label className="form-label" style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Faixa de Investimento / Preço</span>
            {(guia.estrategia_preco || "sem_valor") === "sem_valor" && (
              <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontStyle: "italic" }}>
                (Oculto nas mensagens - foco na reunião)
              </span>
            )}
          </label>
          <input
            type="text"
            className="form-input"
            value={guia.faixa_preco || ""}
            onChange={(e) => setGuia({ ...guia, faixa_preco: e.target.value })}
            placeholder="Ex: A partir de R$ 980 à vista ou 12x"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Objetivo de Conversão Prioritário</label>
          <select
            className="form-input"
            value={guia.objetivo_conversao || "reuniao"}
            onChange={(e) => setGuia({ ...guia, objetivo_conversao: e.target.value })}
          >
            <option value="reuniao">Agendar Reunião Rápida de 15 min (Recomendado)</option>
            <option value="fechamento_direto">Fechamento Direto (Enviar Pix e Proposta)</option>
            <option value="hibrido">Híbrido (Reunião ou Fechamento conforme cliente)</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Janelas Preferenciais de Horário para Reunião</label>
          <input
            type="text"
            className="form-input"
            value={guia.dias_horarios_reuniao || ""}
            onChange={(e) => setGuia({ ...guia, dias_horarios_reuniao: e.target.value })}
            placeholder="Ex: Sexta-feira às 14h ou 16h"
          />
        </div>

        <div className="form-group" style={{ gridColumn: "span 2" }}>
          <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span>Estratégia de Exibição de Valores & Preços nas Mensagens</span>
            <span style={{ fontSize: "0.75rem", background: "rgba(16, 185, 129, 0.15)", color: "#34d399", padding: "2px 8px", borderRadius: 12, border: "1px solid rgba(16, 185, 129, 0.3)" }}>
              Padrão: Apenas Reunião (Sem citar valores)
            </span>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
            {[
              {
                id: "sem_valor",
                titulo: "🎯 Apenas Reunião (Sem Valores)",
                desc: "NUNCA cita preços, mensalidades ou estimativas. Foco total em agendar a reunião de 15 min onde a proposta é passada.",
                destaque: "Padrão Recomendado"
              },
              {
                id: "margem",
                titulo: "📊 Margem / Faixa Estimada",
                desc: "Menciona apenas valores aproximados ('a partir de...') somente se o cliente perguntar diretamente.",
                destaque: "Sob Consulta"
              },
              {
                id: "especifico",
                titulo: "🏷️ Valor Específico Explícito",
                desc: "Cita o valor exato configurado na mensagem caso você queira deixar o preço totalmente transparente.",
                destaque: "Preço Fixo"
              }
            ].map(item => {
              const ativo = (guia.estrategia_preco || "sem_valor") === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => setGuia({ ...guia, estrategia_preco: item.id })}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 8,
                    border: `1.5px solid ${ativo ? "#10b981" : "rgba(255, 255, 255, 0.1)"}`,
                    background: ativo ? "rgba(16, 185, 129, 0.08)" : "rgba(255, 255, 255, 0.02)",
                    cursor: "pointer",
                    transition: "all 0.2s ease"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, color: ativo ? "#34d399" : "#e2e8f0", fontSize: "0.88rem" }}>{item.titulo}</span>
                    {ativo && <span style={{ fontSize: "0.7rem", color: "#34d399", fontWeight: 700 }}>✓ ATIVO</span>}
                  </div>
                  <p style={{ fontSize: "0.78rem", color: "#94a3b8", margin: 0, lineHeight: 1.4 }}>{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="form-group" style={{ gridColumn: "span 2" }}>
          <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span>Tom de Linguagem e Humanização da IA</span>
            <span style={{ fontSize: "0.75rem", background: "rgba(251, 191, 36, 0.15)", color: "#fbbf24", padding: "2px 8px", borderRadius: 12, border: "1px solid rgba(251, 191, 36, 0.3)" }}>
              Base Padrão: Profissional
            </span>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
            {[
              {
                id: "profissional",
                titulo: "💼 Profissional (Normal / Base)",
                desc: "Consultivo, polido, educado, elegante e direto ao ponto. Sem gírias, com alta credibilidade comercial.",
                destaque: "Padrão Recomendado"
              },
              {
                id: "amigavel",
                titulo: "🤝 Amigável & Descontraído",
                desc: "Mais leve, acolhedor e próximo. Estilo parceiro de negócios no WhatsApp.",
                destaque: "Mais Casual"
              },
              {
                id: "formal",
                titulo: "🏛️ Formal & Corporativo",
                desc: "Sóbrio, institucional e protocolar. Ideal para diretores e ambiente corporativo tradicional.",
                destaque: "Executivo"
              }
            ].map(item => {
              const ativo = (guia.tom_conversa || "profissional") === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => setGuia({ ...guia, tom_conversa: item.id })}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 8,
                    border: `1.5px solid ${ativo ? "#fbbf24" : "rgba(255, 255, 255, 0.1)"}`,
                    background: ativo ? "rgba(251, 191, 36, 0.08)" : "rgba(255, 255, 255, 0.02)",
                    cursor: "pointer",
                    transition: "all 0.2s ease"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, color: ativo ? "#fbbf24" : "#e2e8f0", fontSize: "0.88rem" }}>{item.titulo}</span>
                    {ativo && <span style={{ fontSize: "0.7rem", color: "#fbbf24", fontWeight: 700 }}>✓ ATIVO</span>}
                  </div>
                  <p style={{ fontSize: "0.78rem", color: "#94a3b8", margin: 0, lineHeight: 1.4 }}>{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <h3 style={{ fontSize: "1rem", color: "#fbbf24", margin: "24px 0 12px 0" }}>
        Respostas de Referência para a IA Seguir:
      </h3>

      <div className="respostas-grid">
        <div className="resposta-card">
          <span className="resposta-tag">Quando o lead demonstra interesse</span>
          <textarea
            className="resposta-textarea"
            value={guia.respostas_prontas?.interesse || ""}
            onChange={(e) => setGuia({
              ...guia,
              respostas_prontas: { ...guia.respostas_prontas, interesse: e.target.value }
            })}
          />
        </div>
        <div className="resposta-card">
          <span className="resposta-tag">Objeção: "Está caro / Sem orçamento"</span>
          <textarea
            className="resposta-textarea"
            value={guia.respostas_prontas?.preco_caro || ""}
            onChange={(e) => setGuia({
              ...guia,
              respostas_prontas: { ...guia.respostas_prontas, preco_caro: e.target.value }
            })}
          />
        </div>
        <div className="resposta-card">
          <span className="resposta-tag">Objeção: "Já tenho site / já tenho alguém"</span>
          <textarea
            className="resposta-textarea"
            value={guia.respostas_prontas?.ja_tem_site || ""}
            onChange={(e) => setGuia({
              ...guia,
              respostas_prontas: { ...guia.respostas_prontas, ja_tem_site: e.target.value }
            })}
          />
        </div>
        <div className="resposta-card">
          <span className="resposta-tag">Objeção: "Estou sem tempo agora"</span>
          <textarea
            className="resposta-textarea"
            value={guia.respostas_prontas?.sem_tempo || ""}
            onChange={(e) => setGuia({
              ...guia,
              respostas_prontas: { ...guia.respostas_prontas, sem_tempo: e.target.value }
            })}
          />
        </div>
        <div className="resposta-card" style={{ borderColor: "rgba(239, 68, 68, 0.35)", background: "rgba(239, 68, 68, 0.02)" }}>
          <span className="resposta-tag" style={{ color: "#f87171", background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.25)" }}>
            🛑 Recusa Clara / Desistência Educada: "Não tenho interesse" (Sem Insistir)
          </span>
          <textarea
            className="resposta-textarea"
            placeholder="Ex: Sem problemas! Agradeço de verdade pelo retorno e atenção. Caso precise no futuro, ficamos à sua total disposição. Um abraço e excelente semana!"
            value={guia.respostas_prontas?.recusa_desistencia || ""}
            onChange={(e) => setGuia({
              ...guia,
              respostas_prontas: { ...guia.respostas_prontas, recusa_desistencia: e.target.value }
            })}
          />
        </div>
      </div>
    </div>
  );
}
