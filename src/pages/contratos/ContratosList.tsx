import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileSignature, Plus, Edit, Trash2, FileText, Download } from "lucide-react";
import "../../pages/Dashboard.css"; // Reuse dashboard styles for standard layout

export interface Contrato {
  id: number;
  cliente_nome: string;
  projeto_nome: string;
  valor_total: number;
  status: string;
  criado_em: string;
  atualizado_em: string;
}

export function ContratosList() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const carregarContratos = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/contratos");
      const data = await res.json();
      setContratos(data.contratos || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarContratos();
  }, []);

  const handleExcluir = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir este contrato?")) return;
    try {
      await fetch(`/api/contratos/${id}`, { method: "DELETE" });
      carregarContratos();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="dashboard-container" style={{ padding: "30px", maxWidth: "1200px", margin: "0 auto" }}>
      <header className="dashboard-header" style={{ marginBottom: "30px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "24px", display: "flex", alignItems: "center", gap: "10px" }}>
            <FileSignature size={28} style={{ color: "var(--accent-blue)" }} />
            Contratos
          </h1>
          <p className="text-muted">Gerencie os contratos gerados pelo sistema.</p>
        </div>
        <button className="btn-primary" onClick={() => navigate("/contratos/novo")}>
          <Plus size={16} /> Novo Contrato
        </button>
      </header>

      {loading ? (
        <p>Carregando contratos...</p>
      ) : contratos.length === 0 ? (
        <div className="empty-state" style={{ padding: "60px 0", textAlign: "center", background: "var(--bg-surface)", borderRadius: "12px", border: "1px dashed var(--border-color)" }}>
          <FileText size={48} opacity={0.2} style={{ margin: "0 auto 16px" }} />
          <h3>Nenhum contrato encontrado</h3>
          <p className="text-muted" style={{ marginBottom: "20px" }}>Voce ainda nao gerou nenhum contrato.</p>
          <button className="btn-primary" onClick={() => navigate("/contratos/novo")}>
            <Plus size={16} /> Criar meu primeiro contrato
          </button>
        </div>
      ) : (
        <div className="table-container" style={{ background: "var(--bg-surface)", borderRadius: "12px", border: "1px solid var(--border-color)", overflow: "hidden" }}>
          <table className="leads-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Cliente</th>
                <th>Projeto</th>
                <th>Valor Total</th>
                <th>Status</th>
                <th>Criado Em</th>
                <th style={{ textAlign: "right" }}>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {contratos.map((c) => (
                <tr key={c.id}>
                  <td style={{ color: "var(--text-muted)", fontSize: "12px" }}>#{c.id}</td>
                  <td style={{ fontWeight: 600 }}>{c.cliente_nome || "Sem Nome"}</td>
                  <td>{c.projeto_nome || "-"}</td>
                  <td>
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c.valor_total || 0)}
                  </td>
                  <td>
                    <span style={{ 
                      padding: "4px 8px", 
                      borderRadius: "20px", 
                      fontSize: "12px", 
                      fontWeight: 600,
                      background: c.status === 'gerado' ? "#dcfce7" : "#f1f5f9",
                      color: c.status === 'gerado' ? "#16a34a" : "#64748b"
                    }}>
                      {c.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ fontSize: "13px" }}>{new Date(c.criado_em).toLocaleDateString()}</td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                      <button className="btn-icon" title="Visualizar / PDF" onClick={() => navigate(`/contratos/${c.id}`)}>
                        <Download size={16} />
                      </button>
                      <button className="btn-icon" title="Editar" onClick={() => navigate(`/contratos/novo?id=${c.id}`)}>
                        <Edit size={16} />
                      </button>
                      <button className="btn-icon" title="Excluir" style={{ color: "var(--danger-color)" }} onClick={() => handleExcluir(c.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
