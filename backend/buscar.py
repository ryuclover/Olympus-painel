"""
buscar.py — Logica de busca de leads no Google Maps.

Dois modos:
  1. Scraper Python Playwright (sem custo, com suporte a raio, zoom e grid search)
  2. Google Places API        (requer GOOGLE_PLACES_API_KEY no .env)
"""
import csv
import hashlib
import json
import logging
import math
import os
import re
import threading
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional

import requests

import processar

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Estado global da busca
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
# Geocodificação & Cálculo Geográfico
# ---------------------------------------------------------------------------
def geocodificar_localizacao(localizacao: str) -> tuple[Optional[float], Optional[float]]:
    """Obtém coordenadas (lat, lng) para um CEP ou texto de localização.
    Tenta Nominatim (OSM) primeiro; se falhar, usa geocoding via Google Maps HTML
    como fallback (sem API key, gratuito para poucos requests)."""
    if not localizacao or not localizacao.strip():
        return None, None

    # --- Tentativa 1: Nominatim / OpenStreetMap ---
    try:
        url = (
            "https://nominatim.openstreetmap.org/search"
            f"?q={urllib.parse.quote(localizacao)}&format=json&limit=1&countrycodes=br"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "OlympusPainel/2.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data and len(data) > 0:
                logger.info("Geocodificacao Nominatim OK: '%s' -> (%.4f, %.4f)",
                            localizacao, float(data[0]["lat"]), float(data[0]["lon"]))
                return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception as exc:
        logger.warning("Nominatim falhou para '%s': %s — tentando fallback Google...", localizacao, exc)

    # --- Tentativa 2: Fallback via Google Maps sem API key (geocoding via suggest) ---
    try:
        q = urllib.parse.quote(f"{localizacao}, Brasil")
        url_g = f"https://maps.googleapis.com/maps/api/geocode/json?address={q}&region=br&language=pt-BR"
        req_g = urllib.request.Request(url_g, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req_g, timeout=8) as resp_g:
            data_g = json.loads(resp_g.read().decode("utf-8"))
            results = data_g.get("results", [])
            if results:
                loc = results[0]["geometry"]["location"]
                logger.info("Geocodificacao Google fallback OK: '%s' -> (%.4f, %.4f)",
                            localizacao, loc["lat"], loc["lng"])
                return loc["lat"], loc["lng"]
    except Exception as exc2:
        logger.warning("Fallback Google geocoding tambem falhou para '%s': %s", localizacao, exc2)

    return None, None


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calcula a distância em linha reta entre dois pontos na Terra em KM."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def calcular_zoom_por_raio(raio_km: float) -> int:
    """Converte raio em KM para o nível de zoom ideal no Google Maps."""
    if raio_km <= 3:
        return 15  # Bairro / Hiper-local
    elif raio_km <= 7:
        return 14  # Região / Zona
    elif raio_km <= 15:
        return 13  # Cidade média / Centro expandido
    elif raio_km <= 30:
        return 12  # Cidade inteira
    elif raio_km <= 60:
        return 11  # Região metropolitana
    elif raio_km <= 120:
        return 10  # Macrorregião
    else:
        return 9


def gerar_pontos_grade(center_lat: float, center_lng: float, raio_km: float) -> list[tuple[float, float, str]]:
    """
    Gera pontos de busca (Grid) para cobrir a área geográfica quando o raio for grande.
    Retorna lista de (lat, lng, descricao).
    """
    pontos = [(center_lat, center_lng, "Centro")]

    if raio_km > 8:
        # Offset de ~55% do raio para 4 pontos cardeais
        offset_km = raio_km * 0.55
        d_lat = offset_km / 111.32
        cos_lat = math.cos(math.radians(center_lat))
        d_lng = offset_km / (111.32 * (cos_lat if abs(cos_lat) > 0.01 else 1.0))

        pontos.append((center_lat + d_lat, center_lng, "Norte"))
        pontos.append((center_lat - d_lat, center_lng, "Sul"))
        pontos.append((center_lat, center_lng + d_lng, "Leste"))
        pontos.append((center_lat, center_lng - d_lng, "Oeste"))

    if raio_km > 20:
        # Adiciona diagonais para raios muito grandes
        offset_km = raio_km * 0.65
        d_lat = offset_km / 111.32
        cos_lat = math.cos(math.radians(center_lat))
        d_lng = offset_km / (111.32 * (cos_lat if abs(cos_lat) > 0.01 else 1.0))
        pontos.append((center_lat + d_lat, center_lng + d_lng, "Nordeste"))
        pontos.append((center_lat - d_lat, center_lng + d_lng, "Sudeste"))
        pontos.append((center_lat + d_lat, center_lng - d_lng, "Noroeste"))
        pontos.append((center_lat - d_lat, center_lng - d_lng, "Sudoeste"))

    return pontos


def gerar_place_id_estavel(nome: str, endereco: str, telefone: str) -> str:
    """Gera um ID MD5 determinístico e estável para o estabelecimento."""
    base = f"{nome.strip().lower()}_{endereco.strip().lower()}_{telefone.strip()}"
    return hashlib.md5(base.encode("utf-8")).hexdigest()


import telefone_util

# ---------------------------------------------------------------------------
# Modo 1: Scraper Python (Direto com suporte a Raio / Zoom / Grade / Concorrência)
# ---------------------------------------------------------------------------
def _buscar_via_scraper(
    categoria: str,
    localizacao: str,
    raio_km: int,
    center_lat: Optional[float] = None,
    center_lng: Optional[float] = None,
    busca_rapida: bool = True,
    busca_super_rapida: bool = False,
    ignorar_fixos: bool = False
) -> list[dict]:
    """Chama o scraper com coordenadas centrais, zoom, multi-abas e filtros inteligentes."""
    os.environ["SCRAPER_HEADLESS"] = "true"

    try:
        from scraper_google_maps.core import scrape_google_maps

        zoom = calcular_zoom_por_raio(raio_km)
        concorrencia = 8 if busca_super_rapida else (4 if busca_rapida else 1)

        # Meta de leads por raio — valores generosos para compensar deduplicação e filtro haversine
        if raio_km <= 5:
            max_leads_total = 40
        elif raio_km <= 10:
            max_leads_total = 60
        elif raio_km <= 20:
            max_leads_total = 100
        elif raio_km <= 50:
            max_leads_total = 150
        else:
            max_leads_total = 200

        # Se temos coordenadas e raio > 8km, usamos varredura multi-ponto
        if center_lat is not None and center_lng is not None and raio_km > 8:
            pontos = gerar_pontos_grade(center_lat, center_lng, raio_km)
            # Cada ponto busca leads suficientes: usa 30 ou raio//pontos*2, o que for maior
            leads_por_ponto = max(30, (max_leads_total // len(pontos)) * 2)
        elif center_lat is not None and center_lng is not None:
            pontos = [(center_lat, center_lng, "Centro")]
            leads_por_ponto = max_leads_total
        else:
            pontos = [(None, None, "Busca Padrão")]
            leads_por_ponto = max_leads_total

        raw_coletados = []
        # Chave de unicidade: URL do Maps é a fonte mais estável (inclui place ID)
        # Fallback para nome+telefone quando não há URL
        chaves_vistas = set()

        for idx, (p_lat, p_lng, label) in enumerate(pontos):
            _atualizar_estado(mensagem=f"Buscando {categoria} ({label} - raio {raio_km}km)...")
            query = f"{categoria} em {localizacao}"
            raw_ponto = scrape_google_maps(
                query=query,
                max_leads=leads_por_ponto,
                center_lat=p_lat,
                center_lng=p_lng,
                zoom=zoom if p_lat is not None else None,
                concorrencia=concorrencia,
                progress_callback=lambda p, t, m: _atualizar_estado(progresso=p, total=t, mensagem=m)
            )

            for r in raw_ponto:
                nome = r.get("Title") or ""
                if not nome:
                    continue
                # Chave primaria: URL do Maps (contém place ID único)
                url_maps = r.get("Url") or ""
                if url_maps:
                    # Extrai apenas o path do lugar para normalizar (remove @lat,lng e zoom)
                    url_chave = re.sub(r'/@[^/]+', '', url_maps).split('?')[0].lower().strip('/')
                    chave = f"url:{url_chave}" if url_chave else f"np:{nome.lower()}_{r.get('Phone', '')}"
                else:
                    chave = f"np:{nome.lower()}_{r.get('Phone', '')}"

                if chave not in chaves_vistas:
                    chaves_vistas.add(chave)
                    raw_coletados.append(r)

            if len(raw_coletados) >= max_leads_total:
                break

    finally:
        os.environ.pop("SCRAPER_HEADLESS", None)

    # Mapeia, classifica WhatsApp e valida distância pelo raio
    leads = []
    for r in raw_coletados:
        nome = r.get("Title") or ""
        if not nome:
            continue

        url = r.get("Url") or ""
        tel_raw = r.get("Phone") or ""
        end = r.get("Address") or ""
        foto = r.get("FotoUrl") or ""
        lat_lead = _float(r.get("Lat"))
        lng_lead = _float(r.get("Lng"))

        # Processamento inteligente de múltiplos telefones com priorização de WhatsApp
        info_tel = telefone_util.processar_multiplos_telefones(tel_raw)
        tipo_tel = info_tel["tipo_telefone"]
        tem_wpp = info_tel["tem_whatsapp"]
        tel_formatado = info_tel["telefone_principal"] or tel_raw
        tels_secundarios = info_tel["telefones_secundarios"]

        # Filtro de ignorar telefones fixos / 0800 se solicitado
        if ignorar_fixos and not tem_wpp:
            logger.info("Ignorando '%s' (telefone fixo/sem whatsapp: %s)", nome, tel_raw)
            continue

        # Filtro de distância pelo Haversine — margem generosa de 40% para não descartar leads válidos
        if center_lat is not None and center_lng is not None and lat_lead != 0.0 and lng_lead != 0.0:
            dist_km = haversine_km(center_lat, center_lng, lat_lead, lng_lead)
            if dist_km > (raio_km * 1.4):
                logger.info("Descartando '%s' (distancia %.1f km fora do raio de %d km)", nome, dist_km, raio_km)
                continue

        obs_telefones = f"Telefones adicionais: {', '.join(tels_secundarios)}" if tels_secundarios else ""

        place_id = gerar_place_id_estavel(nome, end, tel_raw)
        leads.append({
            "place_id": place_id,
            "nome": nome,
            "categoria": r.get("Category") or "",
            "avaliacao": _float(r.get("Rating")),
            "total_avaliacoes": _int(r.get("Reviews")),
            "telefone": tel_formatado,
            "endereco": end,
            "cidade": "",
            "estado": "",
            "site": r.get("Website") or "",
            "lat": lat_lead if lat_lead != 0.0 else None,
            "lng": lng_lead if lng_lead != 0.0 else None,
            "foto_url": foto or None,
            "tipo_telefone": tipo_tel,
            "tem_whatsapp": 1 if tem_wpp else 0,
            "url_maps": url,
            "observacoes": obs_telefones,
            "observacao": obs_telefones,
        })

    return leads


# ---------------------------------------------------------------------------
# Modo 2: Google Places API (Fallback)
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
                "telefone": "",
                "endereco": place.get("formatted_address", ""),
                "cidade": cidade,
                "estado": "",
                "site": "",
                "lat": loc.get("lat", 0.0),
                "lng": loc.get("lng", 0.0),
                "foto_url": None,
                "tipo_telefone": "nenhum",
                "tem_whatsapp": 0,
            })

        page_token = data.get("next_page_token")
        if not page_token:
            break

        import time
        time.sleep(2)
        paginas += 1

    return leads


# ---------------------------------------------------------------------------
# Thread principal de busca
# ---------------------------------------------------------------------------
def _thread_busca(
    categoria: str,
    localizacao: str,
    cidade: str,
    raio_km: int,
    conn_factory,
    busca_rapida: bool = True,
    busca_super_rapida: bool = False,
    ignorar_fixos: bool = False
):
    import db

    raio_m = raio_km * 1000
    query = f"{categoria} em {localizacao}"

    try:
        _atualizar_estado(mensagem=f"Geocodificando localização '{localizacao}'...")
        center_lat, center_lng = geocodificar_localizacao(localizacao)
        if center_lat and center_lng:
            logger.info("Localizacao '%s' geocodificada: (%.4f, %.4f)", localizacao, center_lat, center_lng)

        scraper_disponivel = (Path(__file__).parent / "scraper_google_maps" / "cli.py").exists()
        api_key = os.environ.get("GOOGLE_PLACES_API_KEY", "")

        if scraper_disponivel:
            logger.info("Usando scraper Python com suporte a raio (%d km, rapida=%s, sem_fixo=%s)", raio_km, busca_rapida, ignorar_fixos)
            raw_leads = _buscar_via_scraper(
                categoria=categoria,
                localizacao=localizacao,
                raio_km=raio_km,
                center_lat=center_lat,
                center_lng=center_lng,
                busca_rapida=busca_rapida,
                busca_super_rapida=busca_super_rapida,
                ignorar_fixos=ignorar_fixos
            )
        elif api_key:
            logger.info("Usando Google Places API")
            _atualizar_estado(mensagem="Buscando via Google Places API...")
            raw_leads = _buscar_via_places_api(query, cidade, raio_m)
        else:
            raise RuntimeError(
                "Nenhuma fonte de busca disponivel. "
                "Configure GOOGLE_PLACES_API_KEY no .env ou crie o scraper."
            )

        _atualizar_estado(total=len(raw_leads), mensagem=f"Analisando {len(raw_leads)} empresas encontradas...")
        logger.info("%d empresas encontradas, analisando presenca digital e sites...", len(raw_leads))

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
            _atualizar_estado(progresso=i + 1, mensagem=f"Verificando site {i+1}/{len(raw_leads)}...")

        conn = conn_factory()
        try:
            salvos = processar.salvar_leads(conn, leads_processados)
            logger.info("%d leads salvos no banco", salvos)
        finally:
            conn.close()

        _atualizar_estado(
            rodando=False,
            progresso=len(leads_processados),
            mensagem=f"Concluido! {len(leads_processados)} leads qualificados no raio de {raio_km} km.",
            erro=None,
        )

    except Exception as exc:
        import traceback
        tb = traceback.format_exc()
        logger.error("Erro na busca:\n%s", tb)
        Path(__file__).parent.joinpath("last_error.log").write_text(tb, encoding="utf-8")
        _atualizar_estado(rodando=False, erro=f"{exc} | {tb[-300:]}", mensagem="Erro na busca.")


def iniciar_busca(
    categoria: str,
    localizacao: str,
    cidade: str,
    raio_km: int,
    busca_rapida: bool = True,
    busca_super_rapida: bool = False,
    ignorar_fixos: bool = False
):
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
        kwargs={"busca_rapida": busca_rapida, "busca_super_rapida": busca_super_rapida, "ignorar_fixos": ignorar_fixos},
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


