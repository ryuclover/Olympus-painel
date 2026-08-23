const CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  novo:        { label: "Novo",        bg: "#f8fafc", color: "#38bdf8" },
  quente:      { label: "Quente",      bg: "#fef2f2", color: "#dc2626" },
  morno:       { label: "Morno",       bg: "#fff7ed", color: "#ea580c" },
  frio:        { label: "Frio",        bg: "#eff6ff", color: "#2563eb" },
  contatado:   { label: "Contatado",   bg: "#f0fdf4", color: "#16a34a" },
  respondeu:   { label: "Respondeu",   bg: "#eef2ff", color: "#4f46e5" },
  qualificado: { label: "Qualificado", bg: "#faf5ff", color: "#7c3aed" },
  fechado:     { label: "Fechado",     bg: "#f1f5f9", color: "#475569" },
  ignorado:    { label: "Ignorado",    bg: "#f8fafc", color: "#64748b" },
};

const DEFAULT_CONFIG = { label: "Novo", bg: "#f8fafc", color: "#38bdf8" };

interface Props {
  status: string;
  size?: "sm" | "md";
}

export function ScoreBadge({ status, size = "sm" }: Props) {
  const c = CONFIG[status?.toLowerCase()] || DEFAULT_CONFIG;
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

