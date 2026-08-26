import sys
import os
import time

os.environ['PYTHONIOENCODING'] = 'utf-8'
os.environ['SCRAPER_HEADLESS'] = 'true'
sys.path.append(r'c:\Users\gabri\OneDrive\Documentos\Pessoal\Prospeccao_auto\Olympus-Painel\backend')

import buscar
import cep
import db

def test_full_flow():
    print("1. Resolvendo CEP 41760035...")
    info_loc = cep.resolver_localizacao("41760035")
    print("   => Localizacao:", info_loc)

    print("2. Disparando busca com 'Todos os Comércios (Geral)'...")
    buscar.iniciar_busca(
        categoria="Todos os Comércios (Geral)",
        localizacao=info_loc["localizacao"],
        cidade=info_loc["cidade"],
        raio_km=5,
        busca_rapida=True,
        busca_super_rapida=False,
        ignorar_fixos=False
    )

    while True:
        status = buscar.estado_busca
        print(f"   Status: rodando={status.get('rodando')}, progresso={status.get('progresso')}/{status.get('total')}, msg='{status.get('mensagem')}'")
        if not status.get("rodando"):
            break
        time.sleep(3)

    conn = db.conectar()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM leads")
    total_db = cursor.fetchone()[0]
    print(f"3. Busca finalizada com SUCESSO! Total de leads no banco: {total_db}")

    cursor.execute("SELECT nome, categoria, telefone FROM leads ORDER BY atualizado_em DESC LIMIT 10")
    for row in cursor.fetchall():
        print("   -", row)
    conn.close()

if __name__ == '__main__':
    test_full_flow()
