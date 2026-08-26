"""
test_sistema.py — Bateria de testes automatizados com PyTest para o Olympus Painel.

Testa as principais funcionalidades:
1. Conexão e integridade da estrutura do Banco de Dados SQLite.
2. Resolução de CEP e Geocodificação de localidades.
3. Captura e armazenamento de Logs em memória.
4. Endpoints da API Flask (Listagem de leads com filtro WhatsApp, Métricas, Logs, Status da Busca).
"""
import sys
from pathlib import Path

# Garante importação dos módulos do backend
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

import logging
import pytest
import db
import cep
import buscar
import log_store
from app import app as flask_app


@pytest.fixture
def client():
    """Fixture que fornece o cliente de testes da API Flask."""
    flask_app.config["TESTING"] = True
    with flask_app.test_client() as client:
        yield client


def test_banco_de_dados():
    """Testa se a conexão com o SQLite funciona e as colunas obrigatórias existem."""
    conn = db.conectar()
    cursor = conn.cursor()

    # Verifica se a tabela leads existe
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='leads'")
    assert cursor.fetchone() is not None, "A tabela 'leads' deve existir no banco"

    # Verifica se a coluna tem_whatsapp existe na tabela leads
    cursor.execute("PRAGMA table_info(leads)")
    colunas = [col[1] for col in cursor.fetchall()]
    assert "tem_whatsapp" in colunas, "A coluna 'tem_whatsapp' deve existir no banco"
    assert "place_id" in colunas, "A coluna 'place_id' deve existir no banco"

    conn.close()


def test_resolucao_cep():
    """Testa a resolução de um CEP brasileiro válido."""
    res = cep.resolver_localizacao("41760035")
    assert isinstance(res, dict)
    assert "cidade" in res
    assert "localizacao" in res
    assert "Salvador" in res["cidade"] or "Salvador" in res["localizacao"]


def test_geocodificacao():
    """Testa a conversão de texto de localização para coordenadas lat/lng."""
    lat, lng = buscar.geocodificar_localizacao("Salvador, BA")
    assert lat is not None and lng is not None
    assert isinstance(lat, float) and isinstance(lng, float)
    assert -30.0 <= lat <= 5.0  # Latitude no Brasil


def test_log_store():
    """Testa a captura de logs em memória."""
    logger = logging.getLogger("test_logger")
    logger.setLevel(logging.INFO)
    msg_teste = "MENSAGEM_DE_TESTE_PYTEST_AUTOMATION"
    logger.info(msg_teste)

    logs_guardados = list(log_store.log_history)
    assert any(msg_teste in line for line in logs_guardados), "A mensagem de teste deve estar presente nos logs em memória"


def test_api_status_busca(client):
    """Testa endpoint GET /api/buscar/status."""
    response = client.get("/api/buscar/status")
    assert response.status_code == 200
    data = response.get_json()
    assert "rodando" in data
    assert "progresso" in data
    assert "total" in data


def test_api_listar_leads_e_filtro_whatsapp(client):
    """Testa endpoint GET /api/leads e filtro whatsapp=com."""
    # Listagem geral
    res_geral = client.get("/api/leads?limit=10")
    assert res_geral.status_code == 200
    data_geral = res_geral.get_json()
    assert "leads" in data_geral
    assert "total" in data_geral

    # Filtro WhatsApp=com
    res_wpp = client.get("/api/leads?whatsapp=com&limit=10")
    assert res_wpp.status_code == 200
    data_wpp = res_wpp.get_json()
    assert "leads" in data_wpp
    for lead in data_wpp["leads"]:
        assert lead.get("tem_whatsapp") == 1 or lead.get("tem_whatsapp") is True


def test_api_logs_endpoint(client):
    """Testa endpoint GET /api/logs."""
    response = client.get("/api/logs")
    assert response.status_code == 200
    data = response.get_json()
    assert "logs" in data
    assert isinstance(data["logs"], list)


def test_api_dashboard_metrics(client):
    """Testa endpoint GET /api/dashboard/metrics."""
    response = client.get("/api/dashboard/metrics")
    assert response.status_code == 200
    data = response.get_json()
    assert "total_leads" in data
    assert "funil" in data


def test_api_nichos(client):
    """Testa endpoint GET /api/nichos."""
    response = client.get("/api/nichos")
    assert response.status_code == 200
    data = response.get_json()
    assert isinstance(data, list)


def test_api_buscar_cnpj(client):
    """Testa endpoint POST /api/buscar/cnpj (Esqueleto)."""
    response = client.post("/api/buscar/cnpj", json={"cnpj": "00000000000191", "cnae": "4711-3/02", "uf": "SP"})
    assert response.status_code == 200
    data = response.get_json()
    assert data.get("status") == "sucesso"
    assert data.get("cnpj") == "00000000000191"
    assert "ReceitaWS" in data.get("mensagem", "")


def test_buscador_robustez_multi_nicho():
    """Testa o buscador com CEPs reais e a categoria 'Todos os Comércios (Geral)'."""
    import test_benchmark_ceps
    sucessos, total = test_benchmark_ceps.executar_benchmark_ceps(limite_ceps=2)
    assert sucessos == total, f"O buscador deve encontrar leads em todos os CEPs de teste ({sucessos}/{total})"
