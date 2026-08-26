import asyncio
import logging
import os
import urllib.parse
from typing import Optional, List, Dict, Any, Callable
from .extractor import extract_lead_data_async

logger = logging.getLogger(__name__)

# headless=False = browser visivel; True = invisivel (segundo plano)
HEADLESS = os.environ.get("SCRAPER_HEADLESS", "false").lower() == "true"


async def _dismiss_consent_async(page):
    try:
        btn = page.locator('button:has-text("Aceitar tudo"), button:has-text("Accept all"), button:has-text("Concordo")')
        if await btn.count() > 0:
            await btn.first.click()
            await asyncio.sleep(0.3)
    except Exception:
        pass


async def _extract_place_task(context, href: str, sem: asyncio.Semaphore, retries: int = 2) -> Optional[dict]:
    async with sem:
        for attempt in range(retries):
            page = await context.new_page()
            try:
                await page.goto(href, wait_until="domcontentloaded", timeout=16000)
                await _dismiss_consent_async(page)

                # Aguarda brevemente o H1
                try:
                    await page.wait_for_selector('h1', timeout=4000)
                except Exception:
                    pass

                lead_data = await extract_lead_data_async(page, href, "")
                if lead_data.get('Title'):
                    return lead_data

            except Exception as e:
                logger.debug("Erro ao extrair link (%s): %s", href[:60], e)
            finally:
                try:
                    await page.close()
                except Exception:
                    pass

            if attempt < retries - 1:
                await asyncio.sleep(0.4)
        return None


async def _collect_links_from_target(
    context,
    target: dict,
    hrefs_pool: list,
    hrefs_seen: set,
    lock: asyncio.Lock,
    sem_discovery: asyncio.Semaphore,
    max_per_target: int = 30,
    timeout_seconds: Optional[int] = None,
    start_time: Optional[float] = None,
    is_cancelled_callback: Optional[Callable[[], bool]] = None
):
    """Abre uma página de busca no Google Maps e rola o feed para coletar links de lugares."""
    import time
    query = target.get("query", "")
    center_lat = target.get("center_lat")
    center_lng = target.get("center_lng")
    zoom = target.get("zoom")
    label = target.get("label", "Busca")

    encoded_query = urllib.parse.quote_plus(query)
    if center_lat is not None and center_lng is not None and zoom is not None:
        search_url = f"https://www.google.com/maps/search/{encoded_query}/@{center_lat:.6f},{center_lng:.6f},{zoom}z"
    else:
        search_url = f"https://www.google.com/maps/search/{encoded_query}/"

    logger.info("Iniciando varredura paralela [%s]: %s", label, search_url)

    async with sem_discovery:
        page = await context.new_page()
        try:
            try:
                await page.goto(search_url, wait_until="domcontentloaded", timeout=18000)
            except Exception as e:
                logger.warning("Timeout/erro na página [%s]: %s", label, e)

            await _dismiss_consent_async(page)

            try:
                await page.wait_for_selector('div[role="feed"], a[href*="/maps/place/"]', timeout=8000)
            except Exception:
                logger.info("Nenhum resultado direto em [%s] para: %s", label, query)
                return

            max_scrolls = max(6, min(30, max_per_target + 5))
            consecutive_same_count = 0
            local_count = 0

            for scroll_idx in range(max_scrolls):
                if timeout_seconds and start_time and (time.time() - start_time) > timeout_seconds:
                    break
                if is_cancelled_callback and is_cancelled_callback():
                    break

                # Extração instantânea de todos os links via JS direto
                try:
                    page_links = await page.evaluate('''() => {
                        return Array.from(document.querySelectorAll('a[href*="/maps/place/"]'))
                            .map(a => a.href)
                            .filter(h => !!h);
                    }''')
                except Exception:
                    page_links = []

                new_found = 0
                if page_links:
                    async with lock:
                        for href in page_links:
                            if href not in hrefs_seen:
                                hrefs_seen.add(href)
                                hrefs_pool.append(href)
                                new_found += 1
                                local_count += 1

                if local_count >= max_per_target:
                    break

                # Verifica fim da lista
                try:
                    fim_el = await page.query_selector(
                        'span:has-text("Você chegou ao final da lista"), '
                        'span:has-text("Fim da lista"), '
                        'div:has-text("Não encontramos mais resultados"), '
                        'span:has-text("You\'ve reached the end of the list")'
                    )
                    if fim_el:
                        break
                except Exception:
                    pass

                if new_found == 0:
                    consecutive_same_count += 1
                    if consecutive_same_count >= 2:
                        try:
                            await page.evaluate('''() => {
                                const feed = document.querySelector('div[role="feed"]');
                                if (feed) feed.scrollTop = feed.scrollHeight;
                            }''')
                            await asyncio.sleep(0.8)
                        except Exception:
                            pass
                        if consecutive_same_count >= 3:
                            break
                else:
                    consecutive_same_count = 0

                try:
                    await page.evaluate('''() => {
                        const feed = document.querySelector('div[role="feed"]');
                        if (feed) {
                            feed.scrollBy(0, 2500);
                        } else {
                            window.scrollBy(0, 2500);
                        }
                    }''')
                    await asyncio.sleep(0.6 if new_found > 0 else 0.9)
                except Exception:
                    break

        finally:
            try:
                await page.close()
            except Exception:
                pass


async def _async_scrape_multi_targets(
    targets: List[Dict[str, Any]],
    max_leads_total: int = 40,
    headless: bool = True,
    concorrencia_extracao: int = 4,
    progress_callback = None,
    timeout_seconds: Optional[int] = None,
    is_cancelled_callback = None
) -> List[Dict[str, Any]]:
    """
    Executa busca multi-ponto e multi-nicho de forma CONCORRENTE e PARALELA.
    Abre múltiplos fluxos de busca simultaneamente e extrai os resultados em pool compartilhado.
    """
    import time
    from playwright.async_api import async_playwright

    start_time = time.time()
    leads = []
    hrefs_pool = []
    hrefs_seen = set()
    lock = asyncio.Lock()

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=headless,
            slow_mo=10 if not headless else 0,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
            ]
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            locale="pt-BR",
            viewport={"width": 1280, "height": 900},
        )
        try:
            await context.add_cookies([
                {"name": "SOCS", "value": "CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjYwMjIzLjAzX3AwGgJwdBADEgEa", "domain": ".google.com", "path": "/"},
                {"name": "SOCS", "value": "CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjYwMjIzLjAzX3AwGgJwdBADEgEa", "domain": ".google.com.br", "path": "/"},
                {"name": "CONSENT", "value": "PENDING+999", "domain": ".google.com", "path": "/"},
            ])
        except Exception:
            pass

        max_por_target = max(15, (max_leads_total // max(1, len(targets))) * 2)

        # 1. Fase de Descoberta Simultânea (Parallel Discovery com Semaphore)
        if progress_callback:
            progress_callback(0, max_leads_total, f"Varrendo {len(targets)} quadrantes simultaneamente...")

        sem_discovery = asyncio.Semaphore(min(4, len(targets)))
        collect_tasks = [
            _collect_links_from_target(
                context=context,
                target=t,
                hrefs_pool=hrefs_pool,
                hrefs_seen=hrefs_seen,
                lock=lock,
                sem_discovery=sem_discovery,
                max_per_target=max_por_target,
                timeout_seconds=timeout_seconds,
                start_time=start_time,
                is_cancelled_callback=is_cancelled_callback
            )
            for t in targets
        ]

        await asyncio.gather(*collect_tasks, return_exceptions=True)

        hrefs_to_extract = hrefs_pool[:max_leads_total]
        logger.info("Varredura paralela encontrou %d links únicos para extração.", len(hrefs_to_extract))

        if not hrefs_to_extract:
            await browser.close()
            return []

        if progress_callback:
            progress_callback(0, len(hrefs_to_extract), f"Extraindo dados ({0}/{len(hrefs_to_extract)})...")

        # 2. Fase de Extração Concorrente de Detalhes com Recursos Otimizados
        sem = asyncio.Semaphore(concorrencia_extracao)
        extract_tasks = []
        for href in hrefs_to_extract:
            if is_cancelled_callback and is_cancelled_callback():
                break
            extract_tasks.append(asyncio.create_task(_extract_place_task(context, href, sem)))

        extracted_count = 0
        for task in asyncio.as_completed(extract_tasks):
            if is_cancelled_callback and is_cancelled_callback():
                for t in extract_tasks:
                    if not t.done():
                        t.cancel()
                break

            res = await task
            if res:
                leads.append(res)
                extracted_count += 1

            if progress_callback:
                progress_callback(
                    extracted_count,
                    len(hrefs_to_extract),
                    f"Extraindo dados ({extracted_count}/{len(hrefs_to_extract)})..."
                )

        await browser.close()

    return leads


def scrape_google_maps_parallel(
    targets: List[Dict[str, Any]],
    max_leads: int = 40,
    concorrencia: int = 4,
    progress_callback = None,
    timeout_seconds: Optional[int] = None,
    is_cancelled_callback = None
) -> list[dict]:
    """Entry point síncrono para busca multi-ponto e multi-termo em paralelo."""
    headless = os.environ.get("SCRAPER_HEADLESS", "false").lower() == "true"
    return asyncio.run(
        _async_scrape_multi_targets(
            targets=targets,
            max_leads_total=max_leads,
            headless=headless,
            concorrencia_extracao=concorrencia,
            progress_callback=progress_callback,
            timeout_seconds=timeout_seconds,
            is_cancelled_callback=is_cancelled_callback
        )
    )


def scrape_google_maps(
    query: str,
    max_leads: int = 30,
    center_lat: Optional[float] = None,
    center_lng: Optional[float] = None,
    zoom: Optional[int] = None,
    concorrencia: int = 4,
    progress_callback = None,
    timeout_seconds: Optional[int] = None,
    is_cancelled_callback = None
) -> list[dict]:
    """Entry point compatível para busca de alvo único."""
    target = {
        "query": query,
        "center_lat": center_lat,
        "center_lng": center_lng,
        "zoom": zoom,
        "label": "Centro"
    }
    return scrape_google_maps_parallel(
        targets=[target],
        max_leads=max_leads,
        concorrencia=concorrencia,
        progress_callback=progress_callback,
        timeout_seconds=timeout_seconds,
        is_cancelled_callback=is_cancelled_callback
    )
