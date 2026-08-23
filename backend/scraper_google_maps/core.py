import asyncio
import logging
import os
import urllib.parse
from typing import Optional
from .extractor import extract_lead_data_async

logger = logging.getLogger(__name__)

# headless=False = browser visivel; True = invisivel (segundo plano)
HEADLESS = os.environ.get("SCRAPER_HEADLESS", "false").lower() == "true"


async def _dismiss_consent_async(page):
    try:
        btn = page.locator('button:has-text("Aceitar tudo"), button:has-text("Accept all"), button:has-text("Concordo")')
        if await btn.count() > 0:
            await btn.first.click()
            await asyncio.sleep(0.8)
    except Exception:
        pass


async def _extract_place_task(context, href: str, sem: asyncio.Semaphore, retries: int = 2) -> Optional[dict]:
    async with sem:
        for attempt in range(retries):
            page = await context.new_page()
            try:
                await page.goto(href, wait_until="domcontentloaded", timeout=22000)
                await _dismiss_consent_async(page)
                # Aguarda pelo h1 E depois tenta esperar pelo telefone (10s total)
                try:
                    await page.wait_for_selector('h1', timeout=10000)
                except Exception:
                    pass
                try:
                    await page.wait_for_selector(
                        '[data-item-id^="phone:tel:"], [data-item-id="address"]',
                        timeout=4000
                    )
                except Exception:
                    pass

                await asyncio.sleep(0.4)
                lead_data = await extract_lead_data_async(page, href, "")
                if lead_data.get('Title'):
                    return lead_data
                # Sem titulo = pagina incompleta; tenta de novo se tiver retry
                logger.warning("Sem titulo em '%s' (tentativa %d/%d)", href[:80], attempt + 1, retries)
            except Exception as e:
                logger.warning("Erro ao extrair link (%s) tentativa %d: %s", href[:80], attempt + 1, e)
            finally:
                try:
                    await page.close()
                except Exception:
                    pass
            if attempt < retries - 1:
                await asyncio.sleep(1.5)  # pausa antes do retry
        return None


async def _async_scrape(
    query: str,
    max_leads: int = 30,
    headless: bool = True,
    center_lat: Optional[float] = None,
    center_lng: Optional[float] = None,
    zoom: Optional[int] = None,
    concorrencia: int = 4,
    progress_callback = None
) -> list[dict]:
    from playwright.async_api import async_playwright

    encoded_query = urllib.parse.quote_plus(query)
    
    if center_lat is not None and center_lng is not None and zoom is not None:
        search_url = f"https://www.google.com/maps/search/{encoded_query}/@{center_lat:.6f},{center_lng:.6f},{zoom}z"
    else:
        search_url = f"https://www.google.com/maps/search/{encoded_query}/"

    logger.info("Scraper iniciando: %s (max_leads=%d, concorrencia=%d)", search_url, max_leads, concorrencia)
    leads = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=headless,
            slow_mo=20 if not headless else 0,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
            ]
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            locale="pt-BR",
            viewport={"width": 1280, "height": 900},
        )
        search_page = await context.new_page()

        try:
            await search_page.goto(search_url, wait_until="domcontentloaded", timeout=25000)
        except Exception as e:
            logger.warning("Timeout/erro na página inicial de busca: %s", e)

        await _dismiss_consent_async(search_page)

        # Aguarda feed de resultados
        try:
            await search_page.wait_for_selector('div[role="feed"], a[href*="/maps/place/"]', timeout=12000)
        except Exception:
            logger.info("Nenhum resultado carregado ou timeout para: %s", query)
            await browser.close()
            return leads

        # Scroll adaptativo para carregar links
        # Scroll menor (1800px) para não pular resultados com lazy-load do Maps
        max_scrolls = max(10, min(40, max_leads + 5))
        hrefs = []
        hrefs_set = set()  # set para O(1) lookup de duplicatas
        consecutive_same_count = 0

        for scroll_idx in range(max_scrolls):
            links = await search_page.locator('a[href*="/maps/place/"]').all()
            for link in links:
                try:
                    href = await link.get_attribute('href')
                    if href and href not in hrefs_set:
                        hrefs_set.add(href)
                        hrefs.append(href)
                except Exception:
                    pass

            if len(hrefs) >= max_leads:
                break

            # Verifica fim da lista
            try:
                fim_el = await search_page.query_selector(
                    'span:has-text("Você chegou ao final da lista"), '
                    'span:has-text("Fim da lista"), '
                    'div:has-text("Não encontramos mais resultados")'
                )
                if fim_el:
                    break
            except Exception:
                pass

            prev_count = len(hrefs)
            try:
                await search_page.evaluate('''() => {
                    const feed = document.querySelector('div[role="feed"]');
                    if (feed) {
                        feed.scrollBy(0, 1800);
                    } else {
                        window.scrollBy(0, 1800);
                    }
                }''')
                # Mais paciência quando a lista não cresce
                sleep_time = 1.8 if len(hrefs) == prev_count else 1.0
                await asyncio.sleep(sleep_time)
            except Exception:
                break

            if len(hrefs) == prev_count:
                consecutive_same_count += 1
                if consecutive_same_count >= 5:  # um pouco mais de paciência
                    break
            else:
                consecutive_same_count = 0

        hrefs = hrefs[:max_leads]
        logger.info("Encontrados %d links. Iniciando extração concorrente (%d abas simultâneas)...", len(hrefs), concorrencia)
        
        if progress_callback:
            progress_callback(0, len(hrefs), f"Buscando detalhes (0/{len(hrefs)})...")

        # Extração Concorrente Multi-Abas
        sem = asyncio.Semaphore(concorrencia)
        
        completed = [0]
        async def _task_with_progress(href):
            res = await _extract_place_task(context, href, sem)
            completed[0] += 1
            if progress_callback:
                progress_callback(completed[0], len(hrefs), f"Buscando detalhes ({completed[0]}/{len(hrefs)})...")
            return res

        tasks = [_task_with_progress(href) for href in hrefs]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for res in results:
            if isinstance(res, dict) and res.get('Title'):
                leads.append(res)

        await browser.close()
    return leads


def scrape_google_maps(
    query: str,
    max_leads: int = 30,
    center_lat: Optional[float] = None,
    center_lng: Optional[float] = None,
    zoom: Optional[int] = None,
    concorrencia: int = 4,
    progress_callback = None
) -> list[dict]:
    """
    Entry point síncrono com suporte a concorrência multi-abas.
    """
    headless = os.environ.get("SCRAPER_HEADLESS", "false").lower() == "true"
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(
            _async_scrape(
                query=query,
                max_leads=max_leads,
                headless=headless,
                center_lat=center_lat,
                center_lng=center_lng,
                zoom=zoom,
                concorrencia=concorrencia,
                progress_callback=progress_callback
            )
        )
    finally:
        loop.close()
        asyncio.set_event_loop(None)


