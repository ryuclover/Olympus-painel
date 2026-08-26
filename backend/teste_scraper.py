import sys
import os

os.environ['PYTHONIOENCODING'] = 'utf-8'
os.environ['SCRAPER_HEADLESS'] = 'true'
sys.path.append(r'c:\Users\gabri\OneDrive\Documentos\Pessoal\Prospeccao_auto\Olympus-Painel\backend')

from scraper_google_maps.core import scrape_google_maps

def main():
    testes = [
        ('Dentista em Costa Azul, Salvador - BA', -12.9839, -38.4552),
        ('Restaurante em Centro, Rio de Janeiro - RJ', -22.9031, -43.1895)
    ]
    for q, lat, lng in testes:
        print(f'\n--- Iniciando teste: {q} ---')
        try:
            res = scrape_google_maps(
                query=q, max_leads=20, center_lat=lat, center_lng=lng, zoom=15, concorrencia=3
            )
            print(f'=> Capturados: {len(res)} leads')
            for i, r in enumerate(res[:5]):
                titulo = r.get('Title')
                telefone = r.get('Phone')
                print(f'   {i+1}. {titulo} - {telefone}')
        except Exception as e:
            print(f'ERRO: {e}')

if __name__ == '__main__':
    main()
