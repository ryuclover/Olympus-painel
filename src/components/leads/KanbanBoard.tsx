import { useState } from "react";
import type { Lead } from "../../data/leads.mock";
import { MessageCircle, MapPin } from "lucide-react";

interface Props {
  leads: Lead[];
  onLeadUpdate: (lead: Lead) => void;
  onLeadClick: (lead: Lead) => void;
}

const COLUNAS = [
  { id: "novo", label: "Novos", color: "#6b7280" },
  { id: "contatado", label: "Contatados", color: "#3b82f6" },
  { id: "respondeu", label: "Responderam", color: "#8b5cf6" },
  { id: "qualificado", label: "Qualificados", color: "#f59e0b" },
  { id: "fechado", label: "Fechados", color: "#10b981" },
];

export function KanbanBoard({ leads, onLeadUpdate, onLeadClick }: Props) {
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null);

  const handleDragStart = (lead: Lead) => {
    setDraggedLead(lead);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (statusId: string) => {
    if (!draggedLead) return;
    if (draggedLead.status === statusId) {
      setDraggedLead(null);
      return;
    }

    const leadAtualizado = { ...draggedLead, status: statusId as any, etapa: statusId as any };
    onLeadUpdate(leadAtualizado);
    setDraggedLead(null);

    try {
      await fetch(`/api/leads/${encodeURIComponent(draggedLead.id)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: statusId }),
      });
    } catch (e) {
      console.error("Erro ao atualizar status:", e);
    }
  };

  return (
    <div style={{ display: "flex", gap: 16, overflowX: "auto", padding: "16px 0", minHeight: 500 }}>
      {COLUNAS.map(col => {
        const leadsColuna = leads.filter(l => l.status === col.id);
        
        return (
          <div 
            key={col.id}
            style={{ 
              flex: "0 0 280px", 
              background: "var(--bg-secondary)", 
              borderRadius: 8, 
              display: "flex", 
              flexDirection: "column",
              border: "1px solid var(--border-color)",
              maxHeight: "calc(100vh - 200px)"
            }}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(col.id)}
          >
            <div style={{ padding: "12px 16px", borderBottom: `2px solid ${col.color}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ color: "var(--text-primary)" }}>{col.label}</strong>
              <span style={{ background: "var(--bg-primary)", padding: "2px 8px", borderRadius: 12, fontSize: 12, color: "var(--text-muted)" }}>
                {leadsColuna.length}
              </span>
            </div>
            
            <div style={{ padding: 12, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
              {leadsColuna.map(lead => (
                <div 
                  key={lead.id}
                  draggable
                  onDragStart={() => handleDragStart(lead)}
                  onClick={() => onLeadClick(lead)}
                  style={{
                    background: "var(--bg-primary)",
                    padding: 12,
                    borderRadius: 6,
                    border: "1px solid var(--border-color)",
                    cursor: "grab",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                    {lead.empresa}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
                    {lead.categoria}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--accent-blue)" }}>
                      <MapPin size={10} /> {lead.cidade || "S/C"}
                    </span>
                    {lead.temWhatsapp && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--accent-green)" }}>
                        <MessageCircle size={10} /> WPP
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {leadsColuna.length === 0 && (
                <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-muted)", fontSize: 12 }}>
                  Arrastar leads para cá
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
