"""
buscar.py — Logica de busca de leads no Google Maps.

Dois modos:
  1. google-maps-scraper.exe  (sem custo, requer o binario)
  2. Google Places API        (requer GOOGLE_PLACES_API_KEY no .env)

O modo e escolhido automaticamente: scraper primeiro, Places como fallback.
"""
import csv
import hashlib
import io
import logging
import os
import subprocess
import tempfile
import threading
from pathlib import Path
from typing import Optional

import requests

import processar

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Estado global da busca (simples, suficiente para uso local single-user)
# ---------------------------------------------------------------------------
estado_busca: dict = {
    "rodando": False,
    "progresso": 0,
    "total": 0,
    "mensagem": "",
    "erro": None,
}
_lock = threading.Lock()


def _atualizar_estado(**kw):
    with _lock:
        estado_busca.update(kw)


# ---------------------------------------------------------------------------
# Caminho do scraper
# ---------------------------------------------------------------------------
def _caminho_scraper() -> Optional[Path]:
    """Procura o google-maps-scraper.exe dentro da propria pasta backend/ do Olympus-Painel."""
    candidatos = [
        Path(os.environ.get("SCRAPER_PATH", "")) if os.environ.get("SCRAPER_PATH") else None,
        Path(__file__).parent / "google-maps-scraper.exe",
    ]
    for c in candidatos:
        if c and c.is_file():
            return c
    return None


# ---------------------------------------------------------------------------
# Modo 1: scraper EXE
# ---------------------------------------------------------------------------
def _buscar_via_scraper(query: str, raio_m: int) -> list[dict]:
    exe = _caminho_scraper()
    if not exe:
        raise FileNotFoundError("google-maps-scraper.exe nao encontrado")

    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmpdir:
        queries_file = Path(tmpdir) / "queries.txt"
        output_file = Path(tmpdir) / "output.csv"
        queries_file.write_text(query + "\n", encoding="utf-8")

        cmd = [
            str(exe),
            "-input", str(queries_file),
            "-results", str(output_file),
            "-zoom", "15",
            "-exit-on-inactivity", "60s",
        ]
        logger.info("Executando scraper: %s", " ".join(cmd))
        proc = subprocess.run(cmd, capture_output=True, timeout=300)
        if proc.returncode != 0:
            raise RuntimeError(f"Scraper falhou: {proc.stderr.decode()[:500]}")

        if not output_file.exists():
            return []

        return _parse_csv_scraper(output_file.read_text(encoding="utf-8", errors="replace"))


def _parse_csv_scraper(conteudo: str) -> list[dict]:
    leads = []
    reader = csv.DictReader(io.StringIO(conteudo))
    for row in reader:
        nome = row.get("title", "") or row.get("name", "")
        if not nome:
            continue
        place_id = row.get("place_id") or hashlib.md5(nome.encode()).hexdigest()
        leads.append({
            "place_id": place_id,
            "nome": nome,
            "categoria": row.get("category", ""),
            "avaliacao": _float(row.get("rating") or row.get("stars")),
            "total_avaliacoes": _int(row.get("reviews") or row.get("reviewsCount")),
            "telefone": row.get("phone", ""),
            "endereco": row.get("address", ""),
            "cidade": row.get("city", ""),
            "estado": row.get("state", ""),
            "site": row.get("website", ""),
            "lat": _float(row.get("latitude") or row.get("lat")),
            "lng": _float(row.get("longitude") or row.get("lng")),
        })
    return leads


# ---------------------------------------------------------------------------
# Modo 2: Google Places API
# ---------------------------------------------------------------------------
def _buscar_via_places_api(query: str, cidade: str, raio_m: int) -> list[dict]:
    api_key = os.environ.get("GOOGLE_PLACES_API_KEY", "")
    if not api_key:
        raise RuntimeError("GOOGLE_PLACES_API_KEY nao configurada")

    url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
    params = {
        "query": query,
        "key": api_key,
        "language": "pt-BR",
        "region": "br",
    }

    leads = []
    page_token = None
    paginas = 0

    while paginas < 3:
        if page_token:
            params["pagetoken"] = page_token
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        if data.get("status") not in ("OK", "ZERO_RESULTS"):
            raise RuntimeError(f"Places API erro: {data.get('status')} — {data.get('error_message','')}")

        for place in data.get("results", []):
            loc = place.get("geometry", {}).get("location", {})
            leads.append({
                "place_id": place.get("place_id", ""),
                "nome": place.get("name", ""),
                "categoria": ", ".join(place.get("types", [])[:2]),
                "avaliacao": place.get("rating", 0.0),
                "total_avaliacoes": place.get("user_ratings_total", 0),
                "telefone": "",          # textsearch nao retorna telefone
                "endereco": place.get("formatted_address", ""),
                "cidade": cidade,
                "estado": "",
                "site": "",
                "lat": loc.get("lat", 0.0),
                "lng": loc.get("lng", 0.0),
            })

        page_token = data.get("next_page_token")
        if not page_token:
            break

        import time
        time.sleep(2)  # Places API exige delay antes de usar o token
        paginas += 1

    return leads


# ---------------------------------------------------------------------------
# Thread principal de busca
# ---------------------------------------------------------------------------
def _thread_busca(categoria: str, localizacao: str, cidade: str, raio_km: int, conn_factory):
    import db

    raio_m = raio_km * 1000
    query = f"{categoria} em {localizacao}"

    try:
        _atualizar_estado(mensagem=f"Buscando '{query}'...")

        # Tenta scraper primeiro, depois Places API
        exe = _caminho_scraper()
        api_key = os.environ.get("GOOGLE_PLACES_API_KEY", "")

        if exe:
            logger.info("Usando google-maps-scraper.exe")
            _atualizar_estado(mensagem="Buscando via scraper...")
            raw_leads = _buscar_via_scraper(query, raio_m)
        elif api_key:
            logger.info("Usando Google Places API")
            _atualizar_estado(mensagem="Buscando via Google Places API...")
            raw_leads = _buscar_via_places_api(query, cidade, raio_m)
        else:
            raise RuntimeError(
                "Nenhuma fonte de busca disponivel. "
                "Configure GOOGLE_PLACES_API_KEY no .env ou adicione o google-maps-scraper.exe."
            )

        _atualizar_estado(total=len(raw_leads), mensagem=f"Analisando {len(raw_leads)} empresas...")
        logger.info("%d empresas encontradas, analisando sites...", len(raw_leads))

        leads_processados = []
        for i, lead in enumerate(raw_leads):
            site_status = processar.verificar_site(lead.get("site"))
            lead["site_status"] = site_status
            lead["score"] = processar.calcular_score_basico(
                lead.get("avaliacao", 0),
                lead.get("total_avaliacoes", 0),
                site_status,
            )
            leads_processados.append(lead)
            _atualizar_estado(progresso=i + 1, mensagem=f"Analisando {i+1}/{len(raw_leads)}...")

        conn = conn_factory()
        try:
            salvos = processar.salvar_leads(conn, leads_processados)
            logger.info("%d leads salvos no banco", salvos)
        finally:
            conn.close()

        _atualizar_estado(
            rodando=False,
            progresso=len(leads_processados),
            mensagem=f"Concluido! {len(leads_processados)} leads encontrados.",
            erro=None,
        )

    except Exception as exc:
        logger.exception("Erro na busca")
        _atualizar_estado(rodando=False, erro=str(exc), mensagem="Erro na busca.")


def iniciar_busca(categoria: str, localizacao: str, cidade: str, raio_km: int):
    """Inicia a busca em background. Lanca ValueError se ja houver busca rodando."""
    with _lock:
        if estado_busca["rodando"]:
            raise ValueError("Ja existe uma busca em andamento")
        estado_busca.update({
            "rodando": True,
            "progresso": 0,
            "total": 0,
            "mensagem": "Iniciando...",
            "erro": None,
        })

    import db as db_mod
    t = threading.Thread(
        target=_thread_busca,
        args=(categoria, localizacao, cidade, raio_km, db_mod.conectar),
        daemon=True,
    )
    t.start()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _float(v) -> float:
    try:
        return float(v or 0)
    except (ValueError, TypeError):
        return 0.0


def _int(v) -> int:
    try:
        return int(float(v or 0))
    except (ValueError, TypeError):
        return 0

