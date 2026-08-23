import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Save } from "lucide-react";
import "../../pages/Dashboard.css"; // Reuse general styles

export interface DadosContrato {
  // 1. Partes
  prestador_tipo: "PF" | "PJ";
  prestador_nome: string;
  prestador_doc: string;
  prestador_email: string;
  prestador_endereco: string;
  cliente_tipo: "PF" | "PJ";
  cliente_nome: string;
  cliente_doc: string;
  cliente_email: string;
  cliente_endereco: string;

  // 2. Projeto
  projeto_nome: string;
  projeto_descricao: string;
  projeto_secoes: number;
  itens_incluidos: string[];
  itens_excluidos: string;

  // 3. Pagamento
  valor_total: number;
  pagamento_forma: "integral" | "entrada_saldo" | "personalizado";
  pagamento_entrada_pct: number;
  pagamento_saldo_pct: number;
  pagamento_custom: string;

  // 4. Prazos
  prazo_versao_dias: number;
  qtd_alteracoes: number;
  prazo_feedback_dias: number;

  // 5. Adicionais
  hospedagem: "cliente" | "prestador";
  dominio: "cliente" | "prestador";
  suporte_incluso: boolean;
  suporte_dias: number;
  manutencao_inclusa: boolean;
  manutencao_valor: number;
}

const DEFAULT_DADOS: DadosContrato = {
  prestador_tipo: "PF", prestador_nome: "", prestador_doc: "", prestador_email: "", prestador_endereco: "",
  cliente_tipo: "PJ", cliente_nome: "", cliente_doc: "", cliente_email: "", cliente_endereco: "",
  projeto_nome: "Landing Page", projeto_descricao: "Desenvolvimento de Landing Page de alta conversao", projeto_secoes: 5,
  itens_incluidos: ["Design da landing page", "Desenvolvimento responsivo", "Formulario de contato", "Botao de WhatsApp", "SEO basico"],
  itens_excluidos: "",
  valor_total: 1500, pagamento_forma: "entrada_saldo", pagamento_entrada_pct: 50, pagamento_saldo_pct: 50, pagamento_custom: "",
  prazo_versao_dias: 7, qtd_alteracoes: 2, prazo_feedback_dias: 5,
  hospedagem: "cliente", dominio: "cliente", suporte_incluso: true, suporte_dias: 30, manutencao_inclusa: false, manutencao_valor: 0
};

const ITENS_ESCOPO_DEFAULT = [
  "Design da landing page", "Desenvolvimento responsivo", "Formulario de contato", 
  "Botao de WhatsApp", "SEO basico", "Google Analytics", "Meta Pixel", "Copywriting"
];

export function ContratoWizard() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get("id");
  
  const [step, setStep] = useState(1);
  const [dados, setDados] = useState<DadosContrato>(DEFAULT_DADOS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editId) {
      fetch(`/api/contratos/${editId}`)
        .then(r => r.json())
        .then(data => {
          if (data.dados) setDados(data.dados);
        })
        .catch(console.error);
    }
  }, [editId]);

  const updateDado = (key: keyof DadosContrato, value: any) => {
    setDados(prev => ({ ...prev, [key]: value }));
  };

  const handleToggleItem = (item: string) => {
    setDados(prev => {
      const isIncluded = prev.itens_incluidos.includes(item);
      if (isIncluded) return { ...prev, itens_incluidos: prev.itens_incluidos.filter(i => i !== item) };
      return { ...prev, itens_incluidos: [...prev.itens_incluidos, item] };
    });
  };

  const handleSave = async (gerar = false) => {
    setSaving(true);
    try {
      const payload = {
        cliente_nome: dados.cliente_nome,
        projeto_nome: dados.projeto_nome,
        valor_total: dados.valor_total,
        status: gerar ? "gerado" : "rascunho",
        dados: dados
      };

      let url = "/api/contratos";
      let method = "POST";
      if (editId) {
        url = `/api/contratos/${editId}`;
        method = "PUT";
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const resData = await res.json();
      
      if (gerar && resData.id) {
        navigate(`/contratos/${resData.id}`);
      } else {
        alert("Rascunho salvo!");
      }
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-container" style={{ padding: "30px", maxWidth: "800px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "30px", alignItems: "center" }}>
        <h1 style={{ fontSize: "24px" }}>{editId ? "Editar Contrato" : "Novo Contrato"}</h1>
        <button className="btn-outline" onClick={() => navigate("/contratos")}><ArrowLeft size={16}/> Cancelar</button>
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "30px", overflowX: "auto", paddingBottom: "10px" }}>
        {[1,2,3,4,5,6].map(s => (
          <div key={s} style={{
            padding: "8px 16px", borderRadius: "20px", fontSize: "14px", fontWeight: 600,
            background: step === s ? "var(--accent-blue)" : (step > s ? "#dcfce7" : "var(--bg-surface)"),
            color: step === s ? "#fff" : (step > s ? "#16a34a" : "var(--text-muted)"),
            border: step === s ? "none" : "1px solid var(--border-color)",
            cursor: "pointer",
            flexShrink: 0
          }} onClick={() => setStep(s)}>
            {s === 1 && "1. Partes"}
            {s === 2 && "2. Escopo"}
            {s === 3 && "3. Pagamento"}
            {s === 4 && "4. Prazos"}
            {s === 5 && "5. Adicionais"}
            {s === 6 && "6. Revisão"}
          </div>
        ))}
      </div>

      <div style={{ background: "var(--bg-surface)", padding: "30px", borderRadius: "12px", border: "1px solid var(--border-color)", minHeight: "400px" }}>
        
        {step === 1 && (
          <div className="step-content">
            <h3 style={{ marginBottom: "20px", borderBottom: "1px solid var(--border-color)", paddingBottom: "10px" }}>Prestador de Serviço (Você)</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "15px", marginBottom: "30px" }}>
              <div className="form-group">
                <label>Tipo</label>
                <select value={dados.prestador_tipo} onChange={e => updateDado("prestador_tipo", e.target.value as any)}>
                  <option value="PF">Pessoa Física</option>
                  <option value="PJ">Pessoa Jurídica</option>
                </select>
              </div>
              <div className="form-group">
                <label>Nome / Razão Social</label>
                <input type="text" value={dados.prestador_nome} onChange={e => updateDado("prestador_nome", e.target.value)} />
              </div>
              <div className="form-group">
                <label>{dados.prestador_tipo === "PF" ? "CPF" : "CNPJ"}</label>
                <input type="text" value={dados.prestador_doc} onChange={e => updateDado("prestador_doc", e.target.value)} />
              </div>
              <div className="form-group">
                <label>E-mail</label>
                <input type="email" value={dados.prestador_email} onChange={e => updateDado("prestador_email", e.target.value)} />
              </div>
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label>Endereço Completo</label>
                <input type="text" value={dados.prestador_endereco} onChange={e => updateDado("prestador_endereco", e.target.value)} />
              </div>
            </div>

            <h3 style={{ marginBottom: "20px", borderBottom: "1px solid var(--border-color)", paddingBottom: "10px" }}>Cliente (Contratante)</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "15px" }}>
              <div className="form-group">
                <label>Tipo</label>
                <select value={dados.cliente_tipo} onChange={e => updateDado("cliente_tipo", e.target.value as any)}>
                  <option value="PF">Pessoa Física</option>
                  <option value="PJ">Pessoa Jurídica</option>
                </select>
              </div>
              <div className="form-group">
                <label>Nome / Razão Social</label>
                <input type="text" value={dados.cliente_nome} onChange={e => updateDado("cliente_nome", e.target.value)} />
              </div>
              <div className="form-group">
                <label>{dados.cliente_tipo === "PF" ? "CPF" : "CNPJ"}</label>
                <input type="text" value={dados.cliente_doc} onChange={e => updateDado("cliente_doc", e.target.value)} />
              </div>
              <div className="form-group">
                <label>E-mail</label>
                <input type="email" value={dados.cliente_email} onChange={e => updateDado("cliente_email", e.target.value)} />
              </div>
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label>Endereço Completo</label>
                <input type="text" value={dados.cliente_endereco} onChange={e => updateDado("cliente_endereco", e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="step-content">
            <h3 style={{ marginBottom: "20px" }}>Projeto e Escopo</h3>
            <div style={{ display: "grid", gap: "15px", marginBottom: "30px" }}>
              <div className="form-group">
                <label>Nome do Projeto</label>
                <input type="text" value={dados.projeto_nome} onChange={e => updateDado("projeto_nome", e.target.value)} />
              </div>
              <div className="form-group">
                <label>Descrição Breve</label>
                <textarea rows={2} value={dados.projeto_descricao} onChange={e => updateDado("projeto_descricao", e.target.value)} />
              </div>
              <div className="form-group">
                <label>Quantidade Máxima de Seções (Blocos da página)</label>
                <input type="number" value={dados.projeto_secoes} onChange={e => updateDado("projeto_secoes", parseInt(e.target.value) || 0)} />
              </div>
            </div>

            <h4 style={{ marginBottom: "10px" }}>Itens Incluídos</h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "20px", background: "var(--bg-body)", padding: "15px", borderRadius: "8px" }}>
              {ITENS_ESCOPO_DEFAULT.map(item => (
                <label key={item} style={{ display: "flex", gap: "8px", alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={dados.itens_incluidos.includes(item)} onChange={() => handleToggleItem(item)} />
                  {item}
                </label>
              ))}
            </div>

            <div className="form-group">
              <label>Itens expressamente EXCLUÍDOS (Opcional)</label>
              <textarea rows={2} placeholder="Ex: Criacao de logotipo, hospedagem..." value={dados.itens_excluidos} onChange={e => updateDado("itens_excluidos", e.target.value)} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="step-content">
            <h3 style={{ marginBottom: "20px" }}>Valores e Pagamento</h3>
            
            <div className="form-group" style={{ marginBottom: "20px", width: "50%" }}>
              <label>Valor Total do Projeto (R$)</label>
              <input type="number" step="0.01" value={dados.valor_total} onChange={e => updateDado("valor_total", parseFloat(e.target.value) || 0)} />
            </div>

            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Forma de Pagamento</label>
              <select value={dados.pagamento_forma} onChange={e => updateDado("pagamento_forma", e.target.value as any)}>
                <option value="integral">Pagamento Único / Integral</option>
                <option value="entrada_saldo">Entrada + Saldo na Entrega</option>
                <option value="personalizado">Condição Personalizada</option>
              </select>
            </div>

            {dados.pagamento_forma === "entrada_saldo" && (
              <div style={{ display: "flex", gap: "15px", background: "var(--bg-body)", padding: "15px", borderRadius: "8px" }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Entrada (%)</label>
                  <input type="number" value={dados.pagamento_entrada_pct} onChange={e => {
                    const val = parseInt(e.target.value) || 0;
                    updateDado("pagamento_entrada_pct", val);
                    updateDado("pagamento_saldo_pct", 100 - val);
                  }} />
                  <small style={{display:"block", marginTop: 4, color:"var(--text-muted)"}}>
                    Valor: R$ {((dados.valor_total * dados.pagamento_entrada_pct) / 100).toFixed(2)}
                  </small>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Saldo na Entrega (%)</label>
                  <input type="number" value={dados.pagamento_saldo_pct} disabled />
                  <small style={{display:"block", marginTop: 4, color:"var(--text-muted)"}}>
                    Valor: R$ {((dados.valor_total * dados.pagamento_saldo_pct) / 100).toFixed(2)}
                  </small>
                </div>
              </div>
            )}

            {dados.pagamento_forma === "personalizado" && (
              <div className="form-group">
                <label>Descreva a condição de pagamento</label>
                <textarea rows={3} value={dados.pagamento_custom} onChange={e => updateDado("pagamento_custom", e.target.value)} />
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="step-content">
            <h3 style={{ marginBottom: "20px" }}>Prazos e Alterações</h3>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginBottom: "20px" }}>
              <div className="form-group">
                <label>Prazo para primeira versão (Dias Úteis)</label>
                <input type="number" value={dados.prazo_versao_dias} onChange={e => updateDado("prazo_versao_dias", parseInt(e.target.value)||0)} />
              </div>
              <div className="form-group">
                <label>Quantidade de rodadas de alterações</label>
                <input type="number" value={dados.qtd_alteracoes} onChange={e => updateDado("qtd_alteracoes", parseInt(e.target.value)||0)} />
              </div>
              <div className="form-group">
                <label>Prazo para o cliente solicitar alterações (Dias)</label>
                <input type="number" value={dados.prazo_feedback_dias} onChange={e => updateDado("prazo_feedback_dias", parseInt(e.target.value)||0)} />
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="step-content">
            <h3 style={{ marginBottom: "20px" }}>Serviços Adicionais</h3>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "30px" }}>
              <div className="form-group">
                <label>Hospedagem</label>
                <select value={dados.hospedagem} onChange={e => updateDado("hospedagem", e.target.value as any)}>
                  <option value="cliente">Responsabilidade do Cliente</option>
                  <option value="prestador">Fornecida pelo Prestador</option>
                </select>
              </div>
              <div className="form-group">
                <label>Domínio</label>
                <select value={dados.dominio} onChange={e => updateDado("dominio", e.target.value as any)}>
                  <option value="cliente">Responsabilidade do Cliente</option>
                  <option value="prestador">Fornecida pelo Prestador</option>
                </select>
              </div>
              <div className="form-group" style={{ background: "var(--bg-body)", padding: "15px", borderRadius: "8px" }}>
                <label style={{ display: "flex", gap: "8px", alignItems: "center", cursor: "pointer", marginBottom: "10px" }}>
                  <input type="checkbox" checked={dados.suporte_incluso} onChange={e => updateDado("suporte_incluso", e.target.checked)} />
                  Incluir Suporte / Garantia
                </label>
                {dados.suporte_incluso && (
                  <div style={{ marginTop: "10px" }}>
                    <label>Prazo (Dias)</label>
                    <input type="number" value={dados.suporte_dias} onChange={e => updateDado("suporte_dias", parseInt(e.target.value)||0)} />
                  </div>
                )}
              </div>
              <div className="form-group" style={{ background: "var(--bg-body)", padding: "15px", borderRadius: "8px" }}>
                <label style={{ display: "flex", gap: "8px", alignItems: "center", cursor: "pointer", marginBottom: "10px" }}>
                  <input type="checkbox" checked={dados.manutencao_inclusa} onChange={e => updateDado("manutencao_inclusa", e.target.checked)} />
                  Serviço de Manutenção Mensal
                </label>
                {dados.manutencao_inclusa && (
                  <div style={{ marginTop: "10px" }}>
                    <label>Valor Mensal (R$)</label>
                    <input type="number" step="0.01" value={dados.manutencao_valor} onChange={e => updateDado("manutencao_valor", parseFloat(e.target.value)||0)} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="step-content">
            <h3 style={{ marginBottom: "20px" }}>Resumo do Contrato</h3>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", background: "var(--bg-body)", padding: "20px", borderRadius: "8px" }}>
              <div>
                <p className="text-muted" style={{ fontSize: "12px", marginBottom: "4px" }}>Cliente</p>
                <strong>{dados.cliente_nome || "-"}</strong>
              </div>
              <div>
                <p className="text-muted" style={{ fontSize: "12px", marginBottom: "4px" }}>Projeto</p>
                <strong>{dados.projeto_nome || "-"}</strong>
              </div>
              <div>
                <p className="text-muted" style={{ fontSize: "12px", marginBottom: "4px" }}>Valor Total</p>
                <strong style={{ color: "var(--accent-blue)" }}>R$ {dados.valor_total.toFixed(2)}</strong>
              </div>
              <div>
                <p className="text-muted" style={{ fontSize: "12px", marginBottom: "4px" }}>Pagamento</p>
                <strong>
                  {dados.pagamento_forma === "integral" && "Integral"}
                  {dados.pagamento_forma === "entrada_saldo" && `${dados.pagamento_entrada_pct}% / ${dados.pagamento_saldo_pct}%`}
                  {dados.pagamento_forma === "personalizado" && "Personalizado"}
                </strong>
              </div>
              <div>
                <p className="text-muted" style={{ fontSize: "12px", marginBottom: "4px" }}>Prazo e Alterações</p>
                <strong>{dados.prazo_versao_dias} dias úteis | {dados.qtd_alteracoes} rodadas</strong>
              </div>
              <div>
                <p className="text-muted" style={{ fontSize: "12px", marginBottom: "4px" }}>Hospedagem / Domínio</p>
                <strong>H: {dados.hospedagem} / D: {dados.dominio}</strong>
              </div>
            </div>

            <div style={{ marginTop: "30px", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-outline" onClick={() => handleSave(false)} disabled={saving}>
                <Save size={16} /> Salvar Rascunho
              </button>
              <button className="btn-primary" onClick={() => handleSave(true)} disabled={saving}>
                <Check size={16} /> Gerar Contrato
              </button>
            </div>
          </div>
        )}

      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "20px" }}>
        <button className="btn-outline" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}>
          <ArrowLeft size={16} /> Voltar
        </button>
        {step < 6 && (
          <button className="btn-primary" onClick={() => setStep(s => Math.min(6, s + 1))}>
            Avançar <ArrowRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
