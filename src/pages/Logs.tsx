import { useEffect, useState, useRef } from "react";
import { Terminal } from "lucide-react";
import { fetchJson } from "../lib/api";

export function Logs() {
  const [logs, setLogs] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const data = await fetchJson<{ logs?: string[] }>("/api/logs");
        setLogs(data.logs || []);
      } catch (e) {
        console.error("Falha ao buscar logs", e);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div style={{
      height: "100%",
      display: "flex",
      flexDirection: "column",
      padding: "24px",
      gap: "16px",
      backgroundColor: "var(--bg-default)",
      overflow: "hidden"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Terminal size={24} style={{ color: "var(--accent-blue)" }} />
        <h1 style={{ fontSize: "1.5rem", fontWeight: "600", margin: 0, color: "var(--text-primary)" }}>
          Terminal de Logs
        </h1>
      </div>
      
      <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0 }}>
        Acompanhe em tempo real as atividades e processos em segundo plano do backend.
      </p>

      <div style={{
        flex: 1,
        backgroundColor: "#0d1117",
        color: "#c9d1d9",
        padding: "16px",
        borderRadius: "8px",
        fontFamily: "'Fira Code', 'Consolas', monospace",
        fontSize: "0.85rem",
        overflowY: "auto",
        border: "1px solid #30363d",
        boxShadow: "inset 0 0 10px rgba(0,0,0,0.5)"
      }}>
        {logs.length === 0 ? (
          <div style={{ color: "#8b949e", fontStyle: "italic" }}>Aguardando logs...</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} style={{ 
              marginBottom: "4px", 
              whiteSpace: "pre-wrap", 
              wordBreak: "break-all",
              color: log.includes("ERROR") || log.includes("Exception") ? "#ff7b72" : 
                     log.includes("WARNING") ? "#d2a8ff" : "#c9d1d9"
            }}>
              {log}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
