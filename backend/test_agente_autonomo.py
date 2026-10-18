"""
test_agente_autonomo.py — Bateria de testes isolados e modulares para o Agente Autônomo comercial,
Gestão de Reuniões (reunioes_service), Buffer de Debounce (DebounceManager), Formatação de Alertas,
Normalização Telefônica e Parser de IA.
"""
import sys
import time
from pathlib import Path

backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

import pytest
import db
import ia
import reunioes_service
from telefone_util import limpar_digitos
from whatsapp_bot import DebounceManager
from app import app as flask_app


@pytest.fixture
def client():
    """Fornece o cliente HTTP de testes do Flask."""
    flask_app.config["TESTING"] = True
    with flask_app.test_client() as client:
        yield client


@pytest.fixture
def lead_teste():
    """Garante a existência de um lead de teste no banco SQLite."""
    place_id = "test_lead_autonomous_001"
    conn = db.conectar()
    try:
        conn.execute("DELETE FROM leads WHERE place_id = ?", (place_id,))
        conn.execute(
            """
            INSERT INTO leads (place_id, nome, categoria, telefone, tem_whatsapp, status, criado_em, atualizado_em)
            VALUES (?, ?, ?, ?, 1, 'novo', datetime('now'), datetime('now'))
            """,
            (place_id, "Clínica Teste Dr. Silva", "Clínica Médica", "(11) 99999-8888")
        )
        conn.commit()
    finally:
        conn.close()

    yield place_id

    # Limpeza pós-teste
    conn = db.conectar()
    try:
        conn.execute("DELETE FROM leads WHERE place_id = ?", (place_id,))
        conn.execute("DELETE FROM reunioes WHERE lead_id = ?", (place_id,))
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 1. Testes de reunioes_service (CRUD e Sincronização com CRM)
# ---------------------------------------------------------------------------

def test_salvar_reuniao_e_atualizacao_crm(lead_teste):
    """Testa se a reunião é gravada e o lead transita automaticamente para status 'reuniao'."""
    resultado = reunioes_service.salvar_reuniao(
        lead_id=lead_teste,
        lead_nome="Clínica Teste Dr. Silva",
        telefone="11999998888",
        canal="maps",
        titulo="Apresentação de Site",
        data_reuniao="2026-10-23",
        horario_reuniao="14:00",
        link_reuniao="https://meet.google.com/abc-defg-hij",
        notas="Agendamento automatizado via teste"
    )

    assert resultado["id"] > 0
    assert resultado["status"] == "agendada"

    # Valida no banco se o lead mudou para 'reuniao'
    conn = db.conectar()
    try:
        linha = conn.execute("SELECT status FROM leads WHERE place_id = ?", (lead_teste,)).fetchone()
        assert linha is not None
        assert linha["status"] == "reuniao"

        # Valida dados da reunião inserida
        r = conn.execute("SELECT * FROM reunioes WHERE id = ?", (resultado["id"],)).fetchone()
        assert r["data_reuniao"] == "2026-10-23"
        assert r["horario_reuniao"] == "14:00"
        assert r["link_reuniao"] == "https://meet.google.com/abc-defg-hij"
    finally:
        conn.close()


def test_salvar_reuniao_validacao_campos_obrigatorios():
    """Valida que datas ou horários vazios levantam ValueError."""
    with pytest.raises(ValueError):
        reunioes_service.salvar_reuniao(
            lead_id="test",
            lead_nome="Test",
            telefone="11999999999",
            canal="maps",
            titulo="Test",
            data_reuniao="",
            horario_reuniao="14:00"
        )


def test_listar_e_atualizar_reuniao(lead_teste):
    """Testa listagem, atualização de status/notas e exclusão de reunião."""
    res = reunioes_service.salvar_reuniao(
        lead_id=lead_teste,
        lead_nome="Teste Listagem",
        telefone="11988887777",
        canal="maps",
        titulo="Reunião Teste",
        data_reuniao="2026-10-25",
        horario_reuniao="15:30",
    )
    reuniao_id = res["id"]

    # Listar
    todas = reunioes_service.listar_reunioes()
    assert any(r["id"] == reuniao_id for r in todas)

    # Atualizar status e notas
    ok = reunioes_service.atualizar_reuniao(reuniao_id, status="concluida", notas="Fechado contrato de R$ 1.500")
    assert ok is True

    # Verificar atualização
    conn = db.conectar()
    try:
        r = conn.execute("SELECT status, notas FROM reunioes WHERE id = ?", (reuniao_id,)).fetchone()
        assert r["status"] == "concluida"
        assert "Fechado contrato" in r["notas"]
    finally:
        conn.close()

    # Excluir
    excluido = reunioes_service.excluir_reuniao(reuniao_id)
    assert excluido is True
    assert reunioes_service.excluir_reuniao(999999) is False


# ---------------------------------------------------------------------------
# 2. Testes de Formatação de Alerta Admin (Função Pura)
# ---------------------------------------------------------------------------

def test_formatar_alerta_reuniao_admin():
    """Testa se o texto formatado para o WhatsApp do Dono contém todos os dados essenciais."""
    alerta = reunioes_service.formatar_alerta_reuniao_admin(
        lead_nome="Dr. Roberto Clínicas",
        data_reuniao="2026-10-24",
        horario_reuniao="16:00",
        telefone_cliente="11999998888",
        categoria="Clínica Médica",
        cidade="São Paulo"
    )

    assert "*Olympus Alerta:*" in alerta
    assert "Dr. Roberto Clínicas" in alerta
    assert "2026-10-24" in alerta
    assert "16:00" in alerta
    assert "11999998888" in alerta
    assert "Clínica Médica - São Paulo" in alerta


# ---------------------------------------------------------------------------
# 3. Testes de Normalização de Telefones (telefone_util)
# ---------------------------------------------------------------------------

def test_limpar_digitos():
    """Testa a extração e remoção correta do prefixo DDI 55 em telefones brasileiros."""
    assert limpar_digitos("+55 (11) 98888-7777") == "11988887777"
    assert limpar_digitos("5511988887777") == "11988887777"
    assert limpar_digitos("11988887777") == "11988887777"
    assert limpar_digitos("(11) 3333-2222") == "1133332222"
    assert limpar_digitos("") == ""
    assert limpar_digitos(None) == ""


# ---------------------------------------------------------------------------
# 4. Testes do DebounceManager (Isolado)
# ---------------------------------------------------------------------------

def test_debounce_manager_agrupamento():
    """Testa se o DebounceManager cancela disparos imediatos e consolida mensagens rápidas."""
    manager = DebounceManager(delay_segundos=1)
    mensagens_recebidas = []

    def callback_teste(msgs):
        mensagens_recebidas.extend(msgs)

    # Simula lead enviando 3 fragmentos em sequência rápida
    manager.adicionar("lead_123", "Oi, bom dia!", callback_teste)
    manager.adicionar("lead_123", "Quanto custa o site?", callback_teste)
    manager.adicionar("lead_123", "Vocês fazem para dentista?", callback_teste)

    # Antes de 1 segundo, o callback ainda NÃO deve ter disparado
    assert len(mensagens_recebidas) == 0

    # Aguarda o timer do debounce expirar (1.2 segundos)
    time.sleep(1.2)

    # Agora todas as 3 mensagens devem ter sido entregues juntas em uma única chamada
    assert len(mensagens_recebidas) == 3
    assert mensagens_recebidas == [
        "Oi, bom dia!",
        "Quanto custa o site?",
        "Vocês fazem para dentista?"
    ]

    manager.cancelar()


# ---------------------------------------------------------------------------
# 5. Testes do Parser de Análise de Conversa e Detecção de Reuniões
# ---------------------------------------------------------------------------

def test_parsear_analise_conversa_com_reuniao():
    """Testa se o parser extrai corretamente a reunião detectada do JSON da IA."""
    json_ia = """
    ```json
    {
      "estagio": "fechamento",
      "leitura": "Lead confirmou interesse em conversar nesta sexta.",
      "objetivo": "Confirmar horário e enviar link do Google Meet.",
      "resposta_sugerida": "Excelente! Marcado para sexta às 14h. Te mando o link por aqui.",
      "evitar": ["Mudar de assunto", "Oferecer outros horários"],
      "reuniao_detectada": {
        "detectada": true,
        "data_sugerida": "2026-10-23",
        "horario_sugerido": "14:00",
        "resumo": "Reunião de alinhamento 15 min"
      }
    }
    ```
    """
    resultado = ia._parsear_analise_conversa(json_ia)
    assert resultado["estagio"] == "fechamento"
    assert resultado["reuniao_detectada"]["detectada"] is True
    assert resultado["reuniao_detectada"]["data_sugerida"] == "2026-10-23"
    assert resultado["reuniao_detectada"]["horario_sugerido"] == "14:00"
    assert len(resultado["evitar"]) == 2


def test_parsear_analise_conversa_sem_reuniao():
    """Testa se o parser lida de forma segura quando não há reunião marcada."""
    json_ia = """
    {
      "estagio": "interesse",
      "leitura": "Lead quer saber o preço.",
      "objetivo": "Apresentar valor inicial e propor reunião.",
      "resposta_sugerida": "A partir de R$ 980 à vista. Que tal 15 min na sexta?",
      "evitar": []
    }
    """
    resultado = ia._parsear_analise_conversa(json_ia)
    assert resultado["estagio"] == "interesse"
    assert resultado["reuniao_detectada"]["detectada"] is False
    assert resultado["reuniao_detectada"]["data_sugerida"] == ""


# ---------------------------------------------------------------------------
# 6. Testes dos Endpoints HTTP da API Flask
# ---------------------------------------------------------------------------

def test_api_agente_config(client):
    """Testa leitura e atualização de configurações do Agente."""
    res_get = client.get("/api/agente/config")
    assert res_get.status_code == 200
    dados = res_get.get_json()
    assert "guia_vendas" in dados
    assert "provedor_ia_preferido" in dados

    # Salva nova configuração
    res_post = client.post("/api/agente/config", json={
        "provedor_ia_preferido": "nvidia",
        "nvidia_model": "nvidia/nemotron-3.5-super-vl-120b-a12b"
    })
    assert res_post.status_code == 200
    assert res_post.get_json()["ok"] is True


def test_api_reunioes_endpoints(client, lead_teste):
    """Testa endpoints REST de reuniões."""
    # POST /api/reunioes
    payload = {
        "lead_id": lead_teste,
        "lead_nome": "Lead Teste API",
        "telefone": "11999998888",
        "data_reuniao": "2026-10-28",
        "horario_reuniao": "10:00",
        "titulo": "Reunião Teste API"
    }
    res_post = client.post("/api/reunioes", json=payload)
    assert res_post.status_code == 200
    corpo = res_post.get_json()
    assert corpo["ok"] is True
    reuniao_id = corpo["id"]

    # GET /api/reunioes
    res_get = client.get("/api/reunioes")
    assert res_get.status_code == 200
    assert any(r["id"] == reuniao_id for r in res_get.get_json())

    # PATCH /api/reunioes/<id>
    res_patch = client.patch(f"/api/reunioes/{reuniao_id}", json={"status": "concluida"})
    assert res_patch.status_code == 200

    # DELETE /api/reunioes/<id>
    res_del = client.delete(f"/api/reunioes/{reuniao_id}")
    assert res_del.status_code == 200


def test_api_whatsapp_bot_status(client):
    """Testa endpoint GET /api/whatsapp/status."""
    res = client.get("/api/whatsapp/status")
    assert res.status_code == 200
    dados = res.get_json()
    assert "ativo" in dados
    assert "conectado" in dados
    assert "tem_qr" in dados
    assert "total_fila_pendente" in dados


def test_api_whatsapp_simular_interacao_validacao(client):
    """Testa validação de entrada do simulador de interação."""
    res = client.post("/api/whatsapp/simular-interacao", json={})
    assert res.status_code == 400
    assert "erro" in res.get_json()

