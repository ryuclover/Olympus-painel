import sys
import os

os.environ['PYTHONIOENCODING'] = 'utf-8'
os.environ['SCRAPER_HEADLESS'] = 'true'
sys.path.append(r'c:\Users\gabri\OneDrive\Documentos\Pessoal\Prospeccao_auto\Olympus-Painel\backend')

from scraper_google_maps.core import scrape_google_maps

def test_geral():
    termos = ["comércio", "lojas", "restaurantes", "clínicas", "academias"]
    local = "Costa Azul, Salvador - BA"
    total = []
    for t in termos:
        q = f"{t} em {local}"
        print(f"Buscando: {q}...")
        res = scrape_google_maps(query=q, max_leads=15, concorrencia=4)
        print(f"  => {len(res)} leads obtidos para {t}")
        total.extend(res)
        if len(total) >= 50:
            break
    print(f"TOTAL FINAL COLETADO: {len(total)} leads!")
    for i, r in enumerate(total[:5]):
        print(f"  {i+1}. {r.get('Title')} - {r.get('Phone')} - {r.get('Category')}")

if __name__ == '__main__':
    test_geral()
