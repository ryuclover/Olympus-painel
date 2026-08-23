import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Edit, FileSignature } from "lucide-react";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import { gerarTemplateContrato } from "./ContratoTemplate";
import "../../pages/Dashboard.css"; // Reuse dashboard styles

(pdfMake as any).vfs = (pdfFonts as any).pdfMake ? (pdfFonts as any).pdfMake.vfs : (pdfFonts as any).vfs;

export function ContratoView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contrato, setContrato] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchContrato = async () => {
      try {
        const res = await fetch(`/api/contratos/${id}`);
        const data = await res.json();
        if (data.dados) setContrato(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchContrato();
  }, [id]);

  const handleDownloadPDF = () => {
    if (!contrato || !contrato.dados) return;
    const docDefinition = gerarTemplateContrato(contrato.dados);
    pdfMake.createPdf(docDefinition).download(`Contrato_${contrato.cliente_nome.replace(/\s+/g, "_")}.pdf`);
  };

  const handleOpenPDF = () => {
    if (!contrato || !contrato.dados) return;
    const docDefinition = gerarTemplateContrato(contrato.dados);
    pdfMake.createPdf(docDefinition).open();
  };

  if (loading) return <div style={{ padding: 40 }}>Carregando contrato...</div>;
  if (!contrato) return <div style={{ padding: 40 }}>Contrato nao encontrado.</div>;

  return (
    <div className="dashboard-container" style={{ padding: "30px", maxWidth: "900px", margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" }}>
        <div>
          <button className="btn-outline" style={{ border: "none", background: "none", padding: 0, color: "var(--text-muted)", marginBottom: "10px" }} onClick={() => navigate("/contratos")}>
            <ArrowLeft size={16} /> Voltar para lista
          </button>
          <h1 style={{ fontSize: "24px", display: "flex", alignItems: "center", gap: "10px" }}>
            <FileSignature size={28} style={{ color: "var(--accent-blue)" }} />
            Visualizar Contrato
          </h1>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn-outline" onClick={() => navigate(`/contratos/novo?id=${id}`)}>
            <Edit size={16} /> Editar
          </button>
          <button className="btn-primary" onClick={handleDownloadPDF}>
            <Download size={16} /> Baixar PDF
          </button>
        </div>
      </header>

      <div style={{ background: "var(--bg-surface)", padding: "20px", borderRadius: "12px", border: "1px solid var(--border-color)", marginBottom: "30px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p className="text-muted" style={{ fontSize: "12px", marginBottom: "4px" }}>Cliente</p>
          <strong>{contrato.cliente_nome || "-"}</strong>
        </div>
        <div>
          <p className="text-muted" style={{ fontSize: "12px", marginBottom: "4px" }}>Projeto</p>
          <strong>{contrato.projeto_nome || "-"}</strong>
        </div>
        <div>
          <p className="text-muted" style={{ fontSize: "12px", marginBottom: "4px" }}>Valor Total</p>
          <strong style={{ color: "var(--accent-blue)" }}>R$ {contrato.valor_total.toFixed(2)}</strong>
        </div>
        <div>
          <p className="text-muted" style={{ fontSize: "12px", marginBottom: "4px" }}>Criado Em</p>
          <strong>{new Date(contrato.criado_em).toLocaleDateString()}</strong>
        </div>
      </div>

      <div style={{ background: "var(--bg-surface)", borderRadius: "12px", border: "1px solid var(--border-color)", padding: "40px", minHeight: "600px", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" }}>
        
        <div style={{ textAlign: "center", marginBottom: "30px" }}>
          <h2 style={{ fontSize: "18px", textTransform: "uppercase", fontWeight: "bold" }}>
            Contrato de Prestação de Serviços de Desenvolvimento de Landing Page
          </h2>
        </div>

        <p style={{ textAlign: "justify", marginBottom: "20px", lineHeight: "1.6" }}>
          Pelo presente instrumento particular, as partes abaixo qualificadas celebram entre si este Contrato de Prestação de Serviços, que se regerá pelas cláusulas e condições seguintes:
        </p>

        <h3 style={{ fontSize: "16px", marginTop: "20px", marginBottom: "10px" }}>1. DAS PARTES</h3>
        <p style={{ textAlign: "justify", marginBottom: "10px", lineHeight: "1.6" }}>
          <strong>CONTRATADA:</strong> {contrato.dados.prestador_nome}, {contrato.dados.prestador_tipo === 'PF' ? 'CPF' : 'CNPJ'} nº {contrato.dados.prestador_doc}, com endereço em {contrato.dados.prestador_endereco}, e-mail {contrato.dados.prestador_email}.
        </p>
        <p style={{ textAlign: "justify", marginBottom: "20px", lineHeight: "1.6" }}>
          <strong>CONTRATANTE:</strong> {contrato.dados.cliente_nome}, {contrato.dados.cliente_tipo === 'PF' ? 'CPF' : 'CNPJ'} nº {contrato.dados.cliente_doc}, com endereço em {contrato.dados.cliente_endereco}, e-mail {contrato.dados.cliente_email}.
        </p>

        <h3 style={{ fontSize: "16px", marginTop: "20px", marginBottom: "10px" }}>2. DO OBJETO</h3>
        <p style={{ textAlign: "justify", marginBottom: "10px", lineHeight: "1.6" }}>
          2.1. O presente Contrato tem por objeto a prestação de serviços de desenvolvimento e implementação de uma Landing Page (Página de Destino) denominada "{contrato.dados.projeto_nome}".
        </p>
        <p style={{ textAlign: "justify", marginBottom: "20px", lineHeight: "1.6" }}>
          2.2. A descrição breve do projeto consiste em: {contrato.dados.projeto_descricao}. A Landing Page terá um limite máximo de {contrato.dados.projeto_secoes} seções.
        </p>

        {/* This is a simple preview. It doesn't need to match pdfMake 1:1, it just gives an idea */}
        <div style={{ textAlign: "center", marginTop: "40px", padding: "30px", background: "var(--bg-body)", borderRadius: "8px", border: "1px dashed var(--border-color)" }}>
          <p style={{ marginBottom: "15px", color: "var(--text-muted)" }}>Este é apenas um resumo prévio em tela.</p>
          <button className="btn-primary" onClick={handleOpenPDF}>
            <FileSignature size={16} /> Visualizar Documento Completo (Abre em nova aba)
          </button>
        </div>

      </div>
    </div>
  );
}
