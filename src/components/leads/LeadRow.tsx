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
      <td className="lead-cell lead-cell-phone">{lead.telefone}</td>
      <td className="lead-cell">
        <span className="lead-score">{lead.score}</span>
      </td>
      <td className="lead-cell">
        <ScoreBadge status={lead.status} />
      </td>
    </tr>
  );
}
