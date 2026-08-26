"""
test_benchmark_ceps.py — Bateria de Teste do Buscador (15 CEPs do Brasil)

Testa o buscador com 15 CEPs de diferentes regiões do Brasil (capitais, bairros e interiores),
utilizando a categoria 'Todos os Comércios (Geral)'.

Critérios de Avaliação:
- >= 8 aprovados: OK
- >= 10 aprovados: ÓTIMO
- >= 12 aprovados: PERFEITO
"""
import os
import sys
import time
from pathlib import Path

backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

os.environ["SCRAPER_HEADLESS"] = "true"

import cep
import buscar

LISTA_15_CEPS = [
    {"cep": "35046050", "descricao": "Vale Pastoril, Gov. Valadares - MG (Interior/Residencial)"},
    {"cep": "01310100", "descricao": "Av. Paulista, São Paulo - SP (Sudeste/Metrópole)"},
    {"cep": "20040002", "descricao": "Centro, Rio de Janeiro - RJ (Sudeste/Capital)"},
    {"cep": "41760035", "descricao": "Armação, Salvador - BA (Nordeste/Capital)"},
    {"cep": "80020010", "descricao": "Centro, Curitiba - PR (Sul/Capital)"},
    {"cep": "90010150", "descricao": "Centro, Porto Alegre - RS (Sul/Capital)"},
    {"cep": "60165070", "descricao": "Meireles, Fortaleza - CE (Nordeste/Litoral)"},
    {"cep": "74003010", "descricao": "Central, Goiânia - GO (Centro-Oeste/Capital)"},
    {"cep": "50030000", "descricao": "Recife Antigo, Recife - PE (Nordeste/Capital)"},
    {"cep": "29010002", "descricao": "Centro, Vitória - ES (Sudeste/Capital)"},
    {"cep": "79002001", "descricao": "Centro, Campo Grande - MS (Centro-Oeste)"},
    {"cep": "88010000", "descricao": "Centro, Florianópolis - SC (Sul/Ilha)"},
    {"cep": "69005070", "descricao": "Centro, Manaus - AM (Norte/Capital)"},
    {"cep": "13010000", "descricao": "Centro, Campinas - SP (Interior Paulista)"},
    {"cep": "30130000", "descricao": "Funcionários, Belo Horizonte - MG (Sudeste)"},
]


def executar_benchmark_ceps(limite_ceps: int = 15):
    print("=" * 70)
    print("      TESTE DE ROBUSTEZ DO BUSCADOR — 15 CEPS DO BRASIL")
    print("       Modo: 'Todos os Comércios (Geral)' | Raio: 15 km")
    print("=" * 70)

    sucessos = 0
    total_testados = 0
    resultados = []

    ceps_para_testar = LISTA_15_CEPS[:limite_ceps]

    for idx, item in enumerate(ceps_para_testar, start=1):
        num_cep = item["cep"]
        desc = item["descricao"]
        print(f"\n[{idx}/{len(ceps_para_testar)}] Testando CEP {num_cep} ({desc})...")

        t_inicio = time.time()
        try:
            loc = cep.resolver_localizacao(num_cep)
            localizacao = loc.get("localizacao", num_cep)
            cidade = loc.get("cidade", "")
            lat, lng = buscar.geocodificar_localizacao(localizacao)

            leads = buscar._buscar_via_scraper(
                categoria="Todos os Comércios (Geral)",
                localizacao=localizacao,
                raio_km=15,
                center_lat=lat,
                center_lng=lng,
                busca_rapida=True,
                busca_super_rapida=False,
                ignorar_fixos=False,
                timeout_seconds=40,
                start_time=time.time(),
                cidade=cidade,
                max_leads=5
            )

            duracao = time.time() - t_inicio
            qtd = len(leads)

            if qtd >= 1:
                sucessos += 1
                status = "PASSOU"
                amostra = f"{leads[0]['nome']} ({leads[0]['categoria']}) - Tel: {leads[0]['telefone']}"
                print(f"  --> [PASSOU] {qtd} leads encontrados em {duracao:.1f}s | Exemplo: {amostra}")
            else:
                status = "FALHOU"
                print(f"  --> [FALHOU] 0 leads encontrados em {duracao:.1f}s")

            resultados.append({"cep": num_cep, "status": status, "qtd": qtd, "tempo": duracao})

        except Exception as exc:
            duracao = time.time() - t_inicio
            print(f"  --> [ERRO] {exc} em {duracao:.1f}s")
            resultados.append({"cep": num_cep, "status": "ERRO", "qtd": 0, "tempo": duracao})

        total_testados += 1

    print("\n" + "=" * 70)
    print("                    RESUMO DO BENCHMARK")
    print("=" * 70)
    print(f"Total de CEPs Testados: {total_testados}")
    print(f"Total com Sucesso (>=1 lead): {sucessos} / {total_testados}")

    taxa = (sucessos / total_testados) * 100
    print(f"Taxa de Sucesso: {taxa:.1f}%")

    if sucessos >= 12:
        classificacao = "PERFEITO (Excelente cobertura nacional [***])"
    elif sucessos >= 10:
        classificacao = "OTIMO (Alta robustez [**])"
    elif sucessos >= 8:
        classificacao = "OK (Aprovado no limite aceitavel [*])"
    else:
        classificacao = "REQUER AJUSTES (Abaixo do minimo de 8)"

    print(f"STATUS FINAL: {classificacao}")
    print("=" * 70)

    return sucessos, total_testados


def test_buscador_15_ceps_benchmark():
    """Função de teste integrada para o Pytest."""
    # Executa o benchmark para validar robustez
    sucessos, total = executar_benchmark_ceps(limite_ceps=15)
    assert sucessos >= 8, f"O buscador deve encontrar leads em pelo menos 8 dos 15 CEPs (obteve {sucessos}/{total})"


if __name__ == "__main__":
    executar_benchmark_ceps(15)
