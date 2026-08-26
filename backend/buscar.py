"""
buscar.py — Logica de busca de leads no Google Maps de Alta Performance.

Dois modos:
  1. Scraper Python Playwright Concorrente (paralelismo multi-ponto, multi-termo, sem custo)
  2. Google Places API                    (requer GOOGLE_PLACES_API_KEY no .env)
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
from typing import Optional, List, Dict, Any

import requests

import processar
import telefone_util
from paths import caminho_recurso

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
    "parar_busca": False,
}
_lock = threading.Lock()


def _atualizar_estado(**kw):
    with _lock:
        estado_busca.update(kw)


# ---------------------------------------------------------------------------
# Nichos Comerciais para a opção "Todos os Comércios (Geral)"
# ---------------------------------------------------------------------------
NICHOS_COMERCIAIS_GERAL = [
    "comércio",
    "restaurante",
    "supermercado",
    "farmácia",
    "padaria",
    "oficina mecânica",
    "loja de roupas",
    "academia",
    "clínica médica",
    "barbearia",
    "pet shop",
    "lanchonete",
    "auto peças",
    "imobiliária",
    "dentista"
]


# ---------------------------------------------------------------------------
# Geocodificação & Cálculo Geográfico
# ---------------------------------------------------------------------------
def geocodificar_localizacao(localizacao: str) -> tuple[Optional[float], Optional[float]]:
    """Obtém coordenadas (lat, lng) para um CEP ou texto de localização."""
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

    # --- Tentativa 2: Fallback via Google Maps sem API key ---
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
        logger.warning("Fallback Google geocoding falhou para '%s': %s", localizacao, exc2)

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


def calcular_zoom_por_raio(raio_km: int) -> int:
    if raio_km <= 2:
        return 16
    elif raio_km <= 5:
        return 15
    elif raio_km <= 10:
        return 14
    elif raio_km <= 15:
        return 13
    elif raio_km <= 30:
        return 12
    elif raio_km <= 60:
        return 11
    elif raio_km <= 120:
        return 10
    else:
        return 9


def gerar_pontos_grade(center_lat: float, center_lng: float, raio_km: float) -> list[tuple[float, float, str]]:
    """Gera pontos de busca (Grid) para cobrir a área geográfica quando o raio for grande."""
    pontos = [(center_lat, center_lng, "Centro")]

    if raio_km > 6:
        offset_km = raio_km * 0.50
        d_lat = offset_km / 111.32
        cos_lat = math.cos(math.radians(center_lat))
        d_lng = offset_km / (111.32 * (cos_lat if abs(cos_lat) > 0.01 else 1.0))

        pontos.append((center_lat + d_lat, center_lng, "Norte"))
        pontos.append((center_lat - d_lat, center_lng, "Sul"))
        pontos.append((center_lat, center_lng + d_lng, "Leste"))
        pontos.append((center_lat, center_lng - d_lng, "Oeste"))

    if raio_km > 18:
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


# ---------------------------------------------------------------------------
# Modo 1: Scraper Python Concorrente de Alta Performance
# ---------------------------------------------------------------------------
def _buscar_via_scraper(
    categoria: str,
    localizacao: str,
    raio_km: int,
    center_lat: Optional[float] = None,
    center_lng: Optional[float] = None,
    busca_rapida: bool = True,
    busca_super_rapida: bool = False,
    ignorar_fixos: bool = False,
    timeout_seconds: Optional[int] = None,
    start_time: Optional[float] = None,
    busca_completa: bool = False,
    cidade: str = "",
    max_leads: Optional[int] = None,
) -> list[dict]:
    """Chama o scraper concorrente multi-alvo e multi-termo em paralelo."""
    os.environ["SCRAPER_HEADLESS"] = "true"
    browser_path = caminho_recurso("playwright-browsers")
    if browser_path.exists():
        os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(browser_path)

    try:
        from scraper_google_maps.core import scrape_google_maps_parallel

        zoom = calcular_zoom_por_raio(raio_km)
        concorrencia = 12 if busca_super_rapida else (8 if busca_rapida else 4)

        if max_leads is not None:
            max_leads_total = max_leads
        elif raio_km <= 5:
            max_leads_total = 40
        elif raio_km <= 10:
            max_leads_total = 60
        elif raio_km <= 20:
            max_leads_total = 100
        elif raio_km <= 50:
            max_leads_total = 150
        else:
            max_leads_total = 200

        # Identifica se é modo 'Todos os Comércios (Geral)'
        is_geral = "todos os com" in categoria.lower() or "geral" in categoria.lower() or not categoria.strip()

        # Monta os pontos da grade
        if center_lat is not None and center_lng is not None and raio_km > 6:
            pontos = gerar_pontos_grade(center_lat, center_lng, raio_km)
        elif center_lat is not None and center_lng is not None:
            pontos = [(center_lat, center_lng, "Centro")]
        else:
            pontos = [(None, None, "Busca")]

        termo_local = cidade if (cidade and len(cidade.strip()) > 1) else localizacao

        # Constrói os alvos em paralelo
        targets = []
        if is_geral:
            # Distribui termos variados entre os pontos para capturar múltiplos nichos comerciais
            for i, (p_lat, p_lng, label) in enumerate(pontos):
                nicho = NICHOS_COMERCIAIS_GERAL[i % len(NICHOS_COMERCIAIS_GERAL)]
                query = f"{nicho} em {termo_local}"
                targets.append({
                    "query": query,
                    "center_lat": p_lat,
                    "center_lng": p_lng,
                    "zoom": zoom if p_lat is not None else None,
                    "label": f"{label} ({nicho})"
                })
            # Se tiver poucos pontos (ex: só 1 centro), adiciona os 4 maiores nichos em paralelo no centro
            if len(targets) < 4:
                top_nichos = ["restaurante", "mercado", "comércio", "loja"]
                for tn in top_nichos:
                    if not any(t["query"].startswith(tn) for t in targets):
                        targets.append({
                            "query": f"{tn} em {termo_local}",
                            "center_lat": center_lat,
                            "center_lng": center_lng,
                            "zoom": zoom if center_lat is not None else None,
                            "label": f"Centro ({tn})"
                        })
        else:
            for i, (p_lat_val, p_lng_val, p_lbl) in enumerate(pontos):
                targets.append({
                    "query": f"{categoria} em {termo_local}",
                    "center_lat": p_lat_val,
                    "center_lng": p_lng_val,
                    "zoom": zoom if p_lat_val is not None else None,
                    "label": p_lbl
                })

        import time
        def _is_cancelled():
            if estado_busca.get("parar_busca"):
                return True
            if timeout_seconds and start_time and (time.time() - start_time > timeout_seconds):
                return True
            return False

        tempo_restante = None
        if timeout_seconds and start_time:
            tempo_restante = int(timeout_seconds - (time.time() - start_time))
            if tempo_restante <= 0:
                return []

        logger.info("Disparando busca paralela com %d alvos simultâneos...", len(targets))
        raw_coletados = scrape_google_maps_parallel(
            targets=targets,
            max_leads=max_leads_total,
            concorrencia=concorrencia,
            progress_callback=lambda p, t, m: _atualizar_estado(progresso=p, total=t, mensagem=m),
            timeout_seconds=tempo_restante,
            is_cancelled_callback=_is_cancelled
        )

        # Fallback Bairro → Cidade se não encontrou quase nada e a localização tinha bairro
        if len(raw_coletados) < 3 and cidade and cidade.lower() not in localizacao.lower():
            logger.info("Poucos leads no bairro (%d). Executando fallback expandido para a cidade: %s", len(raw_coletados), cidade)
            _atualizar_estado(mensagem=f"Expandindo busca para {cidade}...")
            fallback_targets = [
                {
                    "query": f"{nicho} em {cidade}" if is_geral else f"{categoria} em {cidade}",
                    "center_lat": center_lat,
                    "center_lng": center_lng,
                    "zoom": zoom if center_lat is not None else None,
                    "label": f"Cidade ({nicho if is_geral else categoria})"
                }
                for nicho in (["comércio", "restaurante", "loja"] if is_geral else [categoria])
            ]
            raw_fallback = scrape_google_maps_parallel(
                targets=fallback_targets,
                max_leads=max_leads_total,
                concorrencia=concorrencia,
                progress_callback=lambda p, t, m: _atualizar_estado(progresso=p, total=t, mensagem=m),
                timeout_seconds=tempo_restante,
                is_cancelled_callback=_is_cancelled
            )
            raw_coletados.extend(raw_fallback)

    finally:
        os.environ.pop("SCRAPER_HEADLESS", None)
        os.environ.pop("PLAYWRIGHT_BROWSERS_PATH", None)

    # Deduplicação e normalização dos leads
    chaves_vistas = set()
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

        # Chave primária de deduplicação
        if url:
            url_chave = re.sub(r'/@[^/]+', '', url).split('?')[0].lower().strip('/')
            chave = f"url:{url_chave}" if url_chave else f"np:{nome.lower()}_{tel_raw}"
        else:
            chave = f"np:{nome.lower()}_{tel_raw}"

        if chave in chaves_vistas:
            continue
        chaves_vistas.add(chave)

        # Processamento inteligente de telefones
        info_tel = telefone_util.processar_multiplos_telefones(tel_raw)
        tipo_tel = info_tel["tipo_telefone"]
        tem_wpp = info_tel["tem_whatsapp"]
        tel_formatado = info_tel["telefone_principal"] or tel_raw
        tels_secundarios = info_tel["telefones_secundarios"]

        if ignorar_fixos and not tem_wpp:
            continue

        # Filtro geográfico com margem de 50%
        if center_lat is not None and center_lng is not None and lat_lead != 0.0 and lng_lead != 0.0:
            dist_km = haversine_km(center_lat, center_lng, lat_lead, lng_lead)
            if dist_km > (raio_km * 1.5):
                continue

        obs_telefones = f"Telefones adicionais: {', '.join(tels_secundarios)}" if tels_secundarios else ""
        place_id = gerar_place_id_estavel(nome, end, tel_raw)

        leads.append({
            "place_id": place_id,
            "nome": nome,
            "categoria": r.get("Category") or (categoria if not is_geral else "Comércio Geral"),
            "avaliacao": _float(r.get("Rating")),
            "total_avaliacoes": _int(r.get("Reviews")),
            "telefone": tel_formatado,
            "endereco": end,
            "cidade": cidade or "",
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
    ignorar_fixos: bool = False,
    busca_completa: bool = False
):
    import db
    import time

    start_time = time.time()
    GLOBAL_TIMEOUT = None if busca_completa else 360  # 6 minutos se não for completa

    # Histórico de termos para diversificação
    arquivo_historico = Path(caminho_recurso("data")) / "historico_termos.json"
    arquivo_historico.parent.mkdir(parents=True, exist_ok=True)
    historico = {}
    if arquivo_historico.exists():
        try:
            with open(arquivo_historico, "r", encoding="utf-8") as f:
                historico = json.load(f)
        except Exception:
            historico = {}

    loc_key = localizacao.strip().lower()
    termos_antigos = historico.get(loc_key, [])
    termo_busca = categoria

    # Se o usuário escolheu "Todos os Comércios (Geral)", não substitui por uma única palavra estática
    is_geral = "todos os com" in categoria.lower() or "geral" in categoria.lower() or not categoria.strip()

    if not is_geral:
        if termo_busca.lower() in [t.lower() for t in termos_antigos]:
            alternativas = ["lojas", "comércio", "empresas", "estabelecimentos", "serviços"]
            for alt in alternativas:
                if alt not in [t.lower() for t in termos_antigos]:
                    termo_busca = alt
                    logger.info("Termo '%s' ja buscado em '%s'. Diversificando com '%s'", categoria, loc_key, termo_busca)
                    _atualizar_estado(mensagem=f"Diversificando busca: {termo_busca}...")
                    break

        if termo_busca.lower() not in [t.lower() for t in termos_antigos]:
            termos_antigos.append(termo_busca.lower())
            historico[loc_key] = termos_antigos
            try:
                with open(arquivo_historico, "w", encoding="utf-8") as f:
                    json.dump(historico, f, ensure_ascii=False, indent=2)
            except Exception as e:
                logger.warning("Nao foi possivel salvar historico: %s", e)

    raio_m = raio_km * 1000
    query = f"{termo_busca} em {localizacao}"

    try:
        _atualizar_estado(mensagem=f"Geocodificando localização '{localizacao}'...")
        center_lat, center_lng = geocodificar_localizacao(localizacao)
        if center_lat and center_lng:
            logger.info("Localizacao '%s' geocodificada: (%.4f, %.4f)", localizacao, center_lat, center_lng)
        elif cidade:
            center_lat, center_lng = geocodificar_localizacao(cidade)
            if center_lat and center_lng:
                logger.info("Geocodificacao da cidade '%s': (%.4f, %.4f)", cidade, center_lat, center_lng)

        api_key = os.environ.get("GOOGLE_PLACES_API_KEY", "")

        try:
            logger.info("Iniciando scraper local (%d km, rapida=%s, super=%s)", raio_km, busca_rapida, busca_super_rapida)
            raw_leads = _buscar_via_scraper(
                categoria=termo_busca,
                localizacao=localizacao,
                raio_km=raio_km,
                center_lat=center_lat,
                center_lng=center_lng,
                busca_rapida=busca_rapida,
                busca_super_rapida=busca_super_rapida,
                ignorar_fixos=ignorar_fixos,
                timeout_seconds=GLOBAL_TIMEOUT,
                start_time=start_time,
                busca_completa=busca_completa,
                cidade=cidade
            )
        except Exception as erro_scraper:
            logger.exception("scraper interno falhou")
            if not api_key:
                raise RuntimeError(f"O scraper local falhou: {erro_scraper}") from erro_scraper
            logger.warning("Scraper local falhou; tentando fallback Google Places API")
            _atualizar_estado(mensagem="Scraper local indisponível; buscando via Google Places API...")
            raw_leads = _buscar_via_places_api(query, cidade, raio_m)

        _atualizar_estado(total=len(raw_leads), mensagem=f"Analisando {len(raw_leads)} empresas encontradas...")
        logger.info("%d empresas encontradas, analisando presenca digital e sites...", len(raw_leads))

        from concurrent.futures import ThreadPoolExecutor

        def _processar_um_lead(lead_item):
            site = lead_item.get("site")
            if not site:
                s_status = "sem_site"
            else:
                s_status = processar.verificar_site(site)
            lead_item["site_status"] = s_status
            lead_item["score"] = processar.calcular_score_basico(
                lead_item.get("avaliacao", 0),
                lead_item.get("total_avaliacoes", 0),
                s_status,
            )
            return lead_item

        leads_processados = []
        if raw_leads:
            with ThreadPoolExecutor(max_workers=min(12, len(raw_leads))) as executor:
                futures = [executor.submit(_processar_um_lead, l) for l in raw_leads]
                for idx, fut in enumerate(futures, start=1):
                    if estado_busca.get("parar_busca") or (GLOBAL_TIMEOUT and (time.time() - start_time > GLOBAL_TIMEOUT)):
                        logger.info("Interrompendo processamento de leads por sinal de parada/timeout.")
                        break
                    leads_processados.append(fut.result())
                    _atualizar_estado(progresso=idx, mensagem=f"Verificando presença digital {idx}/{len(raw_leads)}...")

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
    ignorar_fixos: bool = False,
    busca_completa: bool = False
):
    """Inicia a busca em background. Lança ValueError se já houver busca rodando."""
    with _lock:
        if estado_busca["rodando"]:
            raise ValueError("Ja existe uma busca em andamento")
        estado_busca.update({
            "rodando": True,
            "progresso": 0,
            "total": 0,
            "mensagem": "Iniciando...",
            "erro": None,
            "parar_busca": False,
        })

    import db as db_mod
    t = threading.Thread(
        target=_thread_busca,
        args=(categoria, localizacao, cidade, raio_km, db_mod.conectar),
        kwargs={
            "busca_rapida": busca_rapida,
            "busca_super_rapida": busca_super_rapida,
            "ignorar_fixos": ignorar_fixos,
            "busca_completa": busca_completa
        },
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
