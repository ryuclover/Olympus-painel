import sys
import os

os.environ['PYTHONIOENCODING'] = 'utf-8'
os.environ['SCRAPER_HEADLESS'] = 'true'
sys.path.append(r'c:\Users\gabri\OneDrive\Documentos\Pessoal\Prospeccao_auto\Olympus-Painel\backend')

import buscar
import cep

info_loc = cep.resolver_localizacao('41760035')
print('Localizacao resolvida:', info_loc)

lat, lng = buscar.geocodificar_localizacao(info_loc['localizacao'])
print(f'Lat/Lng: {lat}, {lng}')

leads = buscar._buscar_via_scraper(
    categoria='Todos os Comércios (Geral)',
    localizacao=info_loc['localizacao'],
    raio_km=20,
    center_lat=lat,
    center_lng=lng,
    busca_rapida=True,
    busca_super_rapida=False,
    ignorar_fixos=False
)

print(f'Total de leads retornados por _buscar_via_scraper: {len(leads)}')
for i, l in enumerate(leads[:5]):
    print(f'  {i+1}. {l.get("nome")} - {l.get("categoria")} - {l.get("telefone")}')
