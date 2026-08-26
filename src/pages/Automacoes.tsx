import { Sparkles, LayoutTemplate, Globe, ArrowRight } from "lucide-react";
import "./Automacoes.css";

export function Automacoes() {
  return (
    <div className="automacoes-page">
      <header className="automacoes-header">
        <h2 className="title-large">
          <Sparkles className="icon-pulse" size={24} color="var(--accent-blue)" /> 
          Automações & Inteligência Artificial
        </h2>
        <p className="text-muted">
          Gerencie suas ferramentas automatizadas de prospecção e engajamento.
        </p>
      </header>

      <div className="automacoes-grid">
        {/* Card 1: Gerador de Sites */}
        <div className="automacao-card">
          <div className="automacao-icon-wrapper">
            <LayoutTemplate size={32} color="var(--accent-green)" />
          </div>
          <div className="automacao-content">
            <h3>Gerador de Sites via IA</h3>
            <p>
              Crie exemplos de sites de alta conversão automaticamente para os leads que 
              não possuem site ou que têm presença digital ruim.
            </p>
            <button className="btn-primary" style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Globe size={16} /> Gerar Site Exemplo <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* Card Placeholder para futuras automações */}
        <div className="automacao-card disabled-card">
          <div className="automacao-icon-wrapper" style={{ opacity: 0.5 }}>
            <Sparkles size={32} color="var(--text-muted)" />
          </div>
          <div className="automacao-content" style={{ opacity: 0.7 }}>
            <h3>Disparos em Massa (Em Breve)</h3>
            <p>
              Automatize o envio de propostas e follow-ups diretamente no WhatsApp dos seus leads.
            </p>
            <button className="btn-outline" disabled style={{ marginTop: '16px' }}>
              Disponível na v2.0
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
