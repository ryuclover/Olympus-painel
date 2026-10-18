import { Cpu, CheckCircle2, AlertCircle } from "lucide-react";

interface MotorIATabProps {
  nvidiaKey: string;
  setNvidiaKey: (k: string) => void;
  nvidiaModel: string;
  setNvidiaModel: (m: string) => void;
  testarNvidia: () => void;
  testandoNvidia: boolean;
  resultadoTesteNvidia: any;
}

export function MotorIATab({
  nvidiaKey,
  setNvidiaKey,
  nvidiaModel,
  setNvidiaModel,
  testarNvidia,
  testandoNvidia,
  resultadoTesteNvidia
}: MotorIATabProps) {
  return (
    <div className="agente-card">
      <h2 className="agente-card-title">
        <Cpu size={20} color="#fbbf24" />
        Configuração do Motor NVIDIA Nemotron 3.5 Super
      </h2>
      <p className="agente-card-desc">
        O motor de inteligência artificial primário do Olympus utiliza o modelo de raciocínio de 124B gratuito através do endpoint da NVIDIA Build.
      </p>

      <div className="form-group" style={{ maxWidth: 650 }}>
        <label className="form-label">Chave de API NVIDIA (NVIDIA_API_KEY)</label>
        <input
          type="password"
          className="form-input"
          placeholder="nvapi-..."
          value={nvidiaKey}
          onChange={(e) => setNvidiaKey(e.target.value)}
        />
        <small style={{ color: "#9ca3af", display: "block", marginTop: 4 }}>
          Obtenha gratuitamente em:{" "}
          <a href="https://build.nvidia.com" target="_blank" rel="noreferrer" style={{ color: "#fbbf24" }}>
            build.nvidia.com
          </a>
        </small>
      </div>

      <div className="form-group" style={{ maxWidth: 650 }}>
        <label className="form-label">Modelo Selecionado</label>
        <input
          type="text"
          className="form-input"
          value={nvidiaModel}
          onChange={(e) => setNvidiaModel(e.target.value)}
        />
      </div>

      <div style={{ marginTop: 20 }}>
        <button className="btn-primary" onClick={testarNvidia} disabled={testandoNvidia}>
          <Cpu size={16} /> {testandoNvidia ? "Testando Conexão com Nemotron..." : "Testar Conexão Nemotron"}
        </button>
      </div>

      {resultadoTesteNvidia && (
        <div
          className="status-box-test"
          style={{
            marginTop: 16,
            borderColor: resultadoTesteNvidia.ok ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)",
            background: resultadoTesteNvidia.ok ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
            color: resultadoTesteNvidia.ok ? "#34d399" : "#f87171"
          }}
        >
          {resultadoTesteNvidia.ok ? (
            <>
              <CheckCircle2 size={16} style={{ display: "inline", marginRight: 6 }} />
              <strong>Sucesso!</strong> Resposta: "{resultadoTesteNvidia.dados?.mensagem}" | Tempo:{" "}
              {resultadoTesteNvidia.dados?.tempo_resposta_segundos}s
            </>
          ) : (
            <>
              <AlertCircle size={16} style={{ display: "inline", marginRight: 6 }} />
              <strong>Falha na conexão:</strong> {resultadoTesteNvidia.erro}
            </>
          )}
        </div>
      )}
    </div>
  );
}
