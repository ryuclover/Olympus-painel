# Olympus-Painel — Backend

Backend independente do Olympus-Painel. **Nao depende do ProspectOS.**

## Como rodar

```powershell
cd backend
py -m pip install -r requirements.txt
py app.py
```

O servidor sobe em http://localhost:9001.

## Fonte de busca

Coloque o `google-maps-scraper.exe` dentro desta pasta `backend/`:

1. Acesse https://github.com/gosom/google-maps-scraper/releases/latest
2. Baixe `google_maps_scraper-*-windows-amd64.exe`
3. Renomeie para `google-maps-scraper.exe`
4. Mova para dentro de `backend/`

OU configure `GOOGLE_PLACES_API_KEY` no arquivo `backend/.env`.

## Endpoints

| Metodo | Rota | Descricao |
|--------|------|-----------|
| POST | /api/buscar | Dispara busca (categoria, localizacao, raio_km) |
| GET | /api/buscar/status | Status da busca em andamento |
| GET | /api/leads | Lista leads salvos |
| GET | /api/leads/:id | Detalhe de um lead |
| POST | /api/leads/:id/status | Atualiza status do lead |
| DELETE | /api/leads/:id | Remove lead |
| GET | /api/info | Informacoes do sistema |
