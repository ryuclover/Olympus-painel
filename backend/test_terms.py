import sys
sys.path.append(r'c:\Users\gabri\OneDrive\Documentos\Pessoal\Prospeccao_auto\Olympus-Painel\backend')
from scraper_google_maps.core import scrape_google_maps

queries = [
    'todos os comércios em Costa Azul, Salvador - BA',
    'lojas e comércio em Costa Azul, Salvador - BA',
    'lojas em Costa Azul, Salvador - BA',
    'restaurantes em Costa Azul, Salvador - BA',
    'empresas em Costa Azul, Salvador - BA',
    'serviços em Costa Azul, Salvador - BA',
    'clínicas em Costa Azul, Salvador - BA'
]

for q in queries:
    print(f'Testando: {q}')
    try:
        res = scrape_google_maps(query=q, max_leads=5, concorrencia=2)
        print(f'  => {len(res)} leads encontrados')
        for r in res[:2]:
            print('     -', r.get('Title'))
    except Exception as e:
        print(f'  => ERRO: {e}')
