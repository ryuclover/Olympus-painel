import type { Lead } from "../../data/leads.mock";
import { ScoreBadge } from "./ScoreBadge";
import { Star } from "lucide-react";

interface Props {
  lead: Lead;
  selected: boolean;
  checked: boolean;
  onCheck: (id: string) => void;
  onClick: (lead: Lead) => void;
}

export function LeadRow({ lead, selected, checked, onCheck, onClick }: Props) {
  return (
    <tr
      className={`lead-row ${selected ? "lead-row-selected" : ""}`}
      onClick={() => onClick(lead)}
    >
      <td className="lead-cell lead-cell-check">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onCheck(lead.id)}
          onClick={e => e.stopPropagation()}
        />
      </td>
      <td className="lead-cell lead-cell-name">
        <span className="lead-name">{lead.empresa}</span>
      </td>
      <td className="lead-cell lead-cell-cat">
        <span className="lead-cat">{lead.categoria}</span>
      </td>
      <td className="lead-cell">
        <span className="lead-rating">
          <Star size={12} fill="#f59e0b" color="#f59e0b" />
          {lead.avaliacao.toFixed(1)}
        </span>
      </td>
      <td className="lead-cell lead-cell-phone">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>{lead.telefone}</span>
          {lead.temWhatsapp ? (
            <a
              href={lead.whatsappLink || `https://wa.me/55${(lead.telefone || "").replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="badge-wpp-tag"
              style={{ fontSize: "0.65rem", padding: "2px 6px", textDecoration: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3, fontWeight: 600 }}
              title="Abrir conversa no WhatsApp"
            >
              💬 WhatsApp
            </a>
          ) : lead.tipoTelefone === "fixo" ? (
            <span className="badge-fixo-tag" style={{ fontSize: "0.65rem", padding: "1px 4px" }}>Fixo</span>
          ) : null}
        </div>
      </td>
      <td className="lead-cell">
        <span className="lead-score">{lead.score}</span>
      </td>
      <td className="lead-cell">
        <ScoreBadge status={lead.status} />
      </td>
    </tr>
  );
}
