import { useState, useEffect } from "react";
import { MessageSquare, Plus, Edit2, Trash2, Check, Star } from "lucide-react";
import "./Mensagens.css";

interface Template {
  id: number;
  titulo: string;
  mensagem: string;
  is_padrao: boolean;
  criado_em: string;
}

export function Mensagens() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregarTemplates();
  }, []);

  const carregarTemplates = async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/templates");
      const data = await resp.json();
      if (Array.isArray(data)) {
        setTemplates(data);
      } else {
        console.error("API Error:", data);
        setTemplates([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const abrirModalNovo = () => {
    setEditId(null);
    setTitulo("");
    setMensagem("Olá {nome}, tudo bem?\nVi que você é do segmento de {nicho} em {cidade} e gostaria de apresentar nossos serviços...");
    setModalOpen(true);
  };

  const abrirModalEditar = (t: Template) => {
    setEditId(t.id);
    setTitulo(t.titulo);
    setMensagem(t.mensagem);
    setModalOpen(true);
  };

  const salvarTemplate = async () => {
    if (!titulo.trim() || !mensagem.trim()) return;
    
    setSalvando(true);
    try {
      const url = editId ? `/api/templates/${editId}` : "/api/templates";
      const method = editId ? "PUT" : "POST";
      
      const resp = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, mensagem })
      });
      
      if (resp.ok) {
        setModalOpen(false);
        carregarTemplates();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSalvando(false);
    }
  };

  const deletarTemplate = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir esta mensagem?")) return;
    try {
      await fetch(`/api/templates/${id}`, { method: "DELETE" });
      carregarTemplates();
    } catch (e) {
      console.error(e);
    }
  };

  const setPadrao = async (id: number) => {
    try {
      await fetch(`/api/templates/${id}/padrao`, { method: "POST" });
      carregarTemplates();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading && templates.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
        Carregando mensagens...
      </div>
    );
  }

  return (
    <div className="mensagens-page">
      <header className="msg-header">
        <div>
          <h2>Templates de Mensagem</h2>
          <p className="text-muted">Crie e gerencie as mensagens automáticas de WhatsApp para seus leads.</p>
        </div>
        <button className="btn-primary" onClick={abrirModalNovo}>
          <Plus size={16} /> Nova Mensagem
        </button>
      </header>
      
      <div className="msg-grid">
        {templates.map(t => (
          <div key={t.id} className={`msg-card ${t.is_padrao ? 'padrao' : ''}`}>
            {t.is_padrao && (
              <div className="msg-badge-padrao">
                <Star size={12} fill="currentColor" /> Padrão (Envio Automático)
              </div>
            )}
            <div className="msg-card-header">
              <h3>{t.titulo}</h3>
              <div className="msg-actions">
                <button onClick={() => abrirModalEditar(t)} title="Editar"><Edit2 size={16} /></button>
                <button onClick={() => deletarTemplate(t.id)} className="btn-delete" title="Excluir"><Trash2 size={16} /></button>
              </div>
            </div>
            
            <div className="msg-body">
              {t.mensagem.split('\n').map((linha, i) => (
                <p key={i}>{linha}</p>
              ))}
            </div>
            
            <div className="msg-footer">
              {!t.is_padrao ? (
                <button className="btn-outline btn-sm" onClick={() => setPadrao(t.id)}>
                  Definir como Padrão
                </button>
              ) : (
                <span className="text-success"><Check size={14} /> Mensagem ativa</span>
              )}
            </div>
          </div>
        ))}
        
        {templates.length === 0 && (
          <div className="empty-state">
            <MessageSquare size={40} className="empty-icon" />
            <h3>Nenhuma mensagem criada</h3>
            <p>Você ainda não criou nenhum template de mensagem para o WhatsApp.</p>
            <button className="btn-primary" onClick={abrirModalNovo} style={{ marginTop: 16 }}>
              Criar primeira mensagem
            </button>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="msg-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="msg-modal-content" onClick={e => e.stopPropagation()}>
            <h3>{editId ? "Editar Mensagem" : "Nova Mensagem"}</h3>
            
            <div className="form-group">
              <label>Título interno (ex: Abordagem Dentistas SP)</label>
              <input 
                type="text" 
                value={titulo} 
                onChange={e => setTitulo(e.target.value)} 
                placeholder="Ex: Abordagem Padrão"
              />
            </div>
            
            <div className="form-group">
              <label>Texto da Mensagem</label>
              <textarea 
                value={mensagem} 
                onChange={e => setMensagem(e.target.value)}
                placeholder="Escreva sua mensagem aqui..."
                rows={8}
              />
              <p className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                Variáveis que você pode usar: <code>{'{nome}'}</code>, <code>{'{nicho}'}</code>, <code>{'{cidade}'}</code>
              </p>
            </div>
            
            <div className="msg-modal-actions">
              <button className="btn-outline" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={salvarTemplate} disabled={salvando || !titulo || !mensagem}>
                {salvando ? "Salvando..." : "Salvar Mensagem"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
