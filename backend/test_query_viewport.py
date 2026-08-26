import sys
import os

os.environ['PYTHONIOENCODING'] = 'utf-8'
os.environ['SCRAPER_HEADLESS'] = 'true'
sys.path.append(r'c:\Users\gabri\OneDrive\Documentos\Pessoal\Prospeccao_auto\Olympus-Painel\backend')

from scraper_google_maps.core import scrape_google_maps

lat, lng = -12.992669, -38.444703

print("--- Teste 1: query='comércio', com center_lat/lng/zoom ---")
res1 = scrape_google_maps(query="comércio", max_leads=10, center_lat=lat, center_lng=lng, zoom=14, concorrencia=2)
print(f"Resultado 1: {len(res1)} leads encontrados!")
for r in res1[:3]:
    print("  *", r.get("Title"))

print("\n--- Teste 2: query='lojas', com center_lat/lng/zoom ---")
res2 = scrape_google_maps(query="lojas", max_leads=10, center_lat=lat, center_lng=lng, zoom=14, concorrencia=2)
print(f"Resultado 2: {len(res2)} leads encontrados!")
for r in res2[:3]:
    print("  *", r.get("Title"))
