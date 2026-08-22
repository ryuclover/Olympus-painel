import type { LeadStatus } from "../../data/leads.mock";

const CONFIG: Record<LeadStatus, { label: string; bg: string; color: string }> = {
  quente:     { label: "Quente",     bg: "#fef2f2", color: "#dc2626" },
  morno:      { label: "Morno",      bg: "#fff7ed", color: "#ea580c" },
  frio:       { label: "Frio",       bg: "#eff6ff", color: "#2563eb" },
  contatado:  { label: "Contatado",  bg: "#f0fdf4", color: "#16a34a" },
  qualificado:{ label: "Qualificado",bg: "#faf5ff", color: "#7c3aed" },
  fechado:    { label: "Fechado",    bg: "#f1f5f9", color: "#475569" },
};

interface Props {
  status: LeadStatus;
  size?: "sm" | "md";
}

export function ScoreBadge({ status, size = "sm" }: Props) {
  const c = CONFIG[status];
  const px = size === "sm" ? "6px 10px" : "4px 12px";
  const fs = size === "sm" ? "11px" : "12px";
  return (
    <span style={{
      background: "transparent",
      border: `1px solid ${c.color}`,
      color: c.color,
      borderRadius: 20,
      padding: px,
      fontSize: fs,
      fontWeight: 600,
      whiteSpace: "nowrap",
    }}>
      {c.label}
    </span>
  );
}
