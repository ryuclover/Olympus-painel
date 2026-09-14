"""
benchmark_ab_scraper.py — Bateria de Testes A/B para Otimização do Scraper do Olympus.

Mede e compara:
1. Bloqueio de Recursos (Versão A: sem bloqueio vs Versão B: com bloqueio)
2. Deduplicação Prévia (Versão A: a posteriori vs Versão B: prévia no banco)
3. Timeouts e Tentativas (Versão A: 16s + 2 retries vs Versão B: 6s + 1 retry)
4. Ciclo de Abas (Versão A: new_page/close vs Versão B: pool de abas fixas)
5. Eficiência de Extração focada em WhatsApp
"""
import asyncio
import ctypes
import os
import sys
import time
from pathlib import Path
from typing import List, Dict, Any, Optional

# Adiciona o diretório backend ao path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from playwright.async_api import async_playwright
from scraper_google_maps.extractor import extract_lead_data_async
import telefone_util


def obter_memoria_mb() -> float:
    """Obtém o uso de memória Working Set do processo atual no Windows em MB."""
    try:
        class PROCESS_MEMORY_COUNTERS(ctypes.Structure):
            _fields_ = [
                ('cb', ctypes.c_ulong),
                ('PageFaultCount', ctypes.c_ulong),
                ('PeakWorkingSetSize', ctypes.c_size_t),
                ('WorkingSetSize', ctypes.c_size_t),
                ('QuotaPeakPagedPoolUsage', ctypes.c_size_t),
                ('QuotaPagedPoolUsage', ctypes.c_size_t),
                ('QuotaPeakNonPagedPoolUsage', ctypes.c_size_t),
                ('QuotaNonPagedPoolUsage', ctypes.c_size_t),
                ('PagefileUsage', ctypes.c_size_t),
                ('PeakPagefileUsage', ctypes.c_size_t),
            ]
        counters = PROCESS_MEMORY_COUNTERS()
        counters.cb = ctypes.sizeof(PROCESS_MEMORY_COUNTERS)
        handle = ctypes.windll.kernel32.GetCurrentProcess()
        if ctypes.windll.psapi.GetProcessMemoryInfo(handle, ctypes.byref(counters), counters.cb):
            return counters.WorkingSetSize / (1024 * 1024)
    except Exception:
        pass
    return 0.0


async def interceptar_rotas_otimizadas(route):
    """Bloqueia mídias pesadas, mantendo o HTML e XHR essenciais."""
    req = route.request
    tipo = req.resource_type
    url = req.url.lower()

    if tipo in ("image", "media", "font"):
        await route.abort()
    elif any(d in url for d in ("google-analytics.com", "doubleclick.net", "googletagmanager.com")):
        await route.abort()
    else:
        await route.continue_()


async def extrair_lugar_versao_a(context, href: str, sem: asyncio.Semaphore) -> Optional[dict]:
    """Versão A (Baseline): Sem bloqueio, timeout de 16s, 2 retries, new_page/close por lead."""
    async with sem:
        for attempt in range(2):
            page = await context.new_page()
            try:
                await page.goto(href, wait_until="domcontentloaded", timeout=16000)
                try:
                    await page.wait_for_selector('h1', timeout=4000)
                except Exception:
                    pass
                lead_data = await extract_lead_data_async(page, href, "")
                if lead_data.get('Title'):
                    return lead_data
            except Exception:
                pass
            finally:
                try:
                    await page.close()
                except Exception:
                    pass
                if attempt < 1:
                    await asyncio.sleep(0.3)
        return None


async def extrair_lugar_versao_b(context, href: str, sem: asyncio.Semaphore) -> Optional[dict]:
    """Versão B (Otimizada): Com timeout de 6s, 1 retry rápido, seletor de 1.5s."""
    async with sem:
        page = await context.new_page()
        try:
            await page.goto(href, wait_until="domcontentloaded", timeout=6000)
            try:
                await page.wait_for_selector('h1', timeout=1500)
            except Exception:
                pass
            lead_data = await extract_lead_data_async(page, href, "")
            if lead_data.get('Title'):
                return lead_data
        except Exception:
            pass
        finally:
            try:
                await page.close()
            except Exception:
                pass
        return None


async def extrair_com_pool_de_abas(context, hrefs: List[str], num_abas: int = 4) -> List[dict]:
    """Versão B (Pool de Abas): Abas fixas consomem fila de URLs sem recriar páginas."""
    queue = asyncio.Queue()
    for h in hrefs:
        await queue.put(h)

    resultados = []
    lock = asyncio.Lock()

    async def worker_page():
        page = await context.new_page()
        try:
            while not queue.empty():
                try:
                    href = queue.get_nowait()
                except asyncio.QueueEmpty:
                    break
                try:
                    await page.goto(href, wait_until="domcontentloaded", timeout=6000)
                    try:
                        await page.wait_for_selector('h1', timeout=1500)
                    except Exception:
                        pass
                    lead_data = await extract_lead_data_async(page, href, "")
                    if lead_data.get('Title'):
                        async with lock:
                            resultados.append(lead_data)
                except Exception:
                    pass
                finally:
                    queue.task_done()
        finally:
            try:
                await page.close()
            except Exception:
                pass

    workers = [asyncio.create_task(worker_page()) for _ in range(num_abas)]
    await asyncio.gather(*workers)
    return resultados


async def coletar_links_amostra(termo: str = "restaurante em curitiba", limite: int = 6) -> List[str]:
    """Coleta uma amostra real de links de empresas no Google Maps para usar como base idêntica de teste."""
    print(f"[*] Coletando amostra real de {limite} links no Google Maps para o termo: '{termo}'...")
    hrefs = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        context = await browser.new_context(locale="pt-BR", viewport={"width": 1280, "height": 900})
        page = await context.new_page()
        try:
            url = f"https://www.google.com/maps/search/{termo.replace(' ', '+')}/"
            await page.goto(url, wait_until="domcontentloaded", timeout=20000)
            try:
                await page.wait_for_selector('div[role="feed"], a[href*="/maps/place/"]', timeout=10000)
            except Exception:
                pass

            # Rola para garantir links suficientes
            for _ in range(3):
                links = await page.evaluate('''() => {
                    return Array.from(document.querySelectorAll('a[href*="/maps/place/"]'))
                        .map(a => a.href)
                        .filter(h => !!h);
                }''')
                for l in links:
                    if l not in hrefs:
                        hrefs.append(l)
                    if len(hrefs) >= limite:
                        break
                if len(hrefs) >= limite:
                    break
                await page.evaluate('''() => {
                    const feed = document.querySelector('div[role="feed"]');
                    if (feed) feed.scrollBy(0, 2000);
                }''')
                await asyncio.sleep(0.8)
        finally:
            await browser.close()

    print(f"[OK] {len(hrefs)} links reais coletados para os testes comparativos.")
    return hrefs[:limite]


async def executar_benchmark():
    print("=" * 75)
    print("      OLYMPUS - BATERIA DE BENCHMARK COMPARATIVO A/B")
    print("=" * 75)

    amostra_links = await coletar_links_amostra(termo="restaurante em curitiba", limite=6)
    if not amostra_links:
        print("[ERRO] Não foi possível obter links de teste do Google Maps.")
        return

    relatorio = {}

    # -------------------------------------------------------------------------
    # TESTE 1 & 3: BLOQUEIO DE RECURSOS & TIMEOUT (Versão A vs Versão B)
    # -------------------------------------------------------------------------
    print("\n" + "-" * 75)
    print(">> TESTE 1 & 3: Bloqueio de Recursos (Imagens/Mídias) e Timeouts Ágeis")
    print("-" * 75)

    # Versão A: Baseline (Sem bloqueio, timeouts 16s)
    print("[1/4] Executando VERSÃO A (Baseline: Tudo liberado, timeout 16s)...")
    mem_antes_a = obter_memoria_mb()
    t0 = time.time()
    resultados_a = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        context = await browser.new_context(locale="pt-BR")
        sem = asyncio.Semaphore(3)
        tasks = [extrair_lugar_versao_a(context, h, sem) for h in amostra_links]
        for res in await asyncio.gather(*tasks):
            if res:
                resultados_a.append(res)
        await browser.close()
    tempo_a = time.time() - t0
    mem_depois_a = obter_memoria_mb()
    mem_pico_a = max(mem_depois_a - mem_antes_a, 0.0)

    print(f"   -> Versão A concluída em {tempo_a:.2f}s | Extraídos: {len(resultados_a)} leads | RAM delta: ~{mem_pico_a:.1f}MB")

    # Versão B: Otimizada (Com bloqueio de imagens/fontes, timeout 6s)
    print("[2/4] Executando VERSÃO B (Otimizada: Imagens bloqueadas, timeout 6s)...")
    mem_antes_b = obter_memoria_mb()
    t0 = time.time()
    resultados_b = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        context = await browser.new_context(locale="pt-BR")
        await context.route("**/*", interceptar_rotas_otimizadas)
        sem = asyncio.Semaphore(3)
        tasks = [extrair_lugar_versao_b(context, h, sem) for h in amostra_links]
        for res in await asyncio.gather(*tasks):
            if res:
                resultados_b.append(res)
        await browser.close()
    tempo_b = time.time() - t0
    mem_depois_b = obter_memoria_mb()
    mem_pico_b = max(mem_depois_b - mem_antes_b, 0.0)

    ganho_tempo = ((tempo_a - tempo_b) / tempo_a) * 100 if tempo_a > 0 else 0
    print(f"   -> Versão B concluída em {tempo_b:.2f}s | Extraídos: {len(resultados_b)} leads | RAM delta: ~{mem_pico_b:.1f}MB")
    print(f"   -> GANHO DE VELOCIDADE: {ganho_tempo:.1f}% mais rápido!")

    relatorio["teste_1_3"] = {
        "tempo_a": tempo_a,
        "tempo_b": tempo_b,
        "leads_a": len(resultados_a),
        "leads_b": len(resultados_b),
        "ganho_tempo_pct": ganho_tempo,
    }

    # -------------------------------------------------------------------------
    # TESTE 2: DEDUPLICAÇÃO PRÉVIA (Versão A vs Versão B)
    # -------------------------------------------------------------------------
    print("\n" + "-" * 75)
    print(">> TESTE 2: Deduplicação Prévia no Banco SQLite vs Tardia")
    print("-" * 75)

    # Simula um cenário onde 50% dos links (ex: 3 de 6) já estão no banco de dados
    banco_links_simulados = set(amostra_links[:3])

    # Versão A: Tardia (Abre todos os 6 links no Playwright, extrai e depois descarta os 3 que já existem)
    print("[3/4] Executando VERSÃO A (Deduplicação Tardia: abre tudo no browser e depois descarta)...")
    t0 = time.time()
    novos_a = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        context = await browser.new_context(locale="pt-BR")
        await context.route("**/*", interceptar_rotas_otimizadas)
        sem = asyncio.Semaphore(3)
        tasks = [extrair_lugar_versao_b(context, h, sem) for h in amostra_links]
        for res in await asyncio.gather(*tasks):
            if res:
                # Deduplicação após extração completa
                if res.get('PageUrl') not in banco_links_simulados:
                    novos_a.append(res)
        await browser.close()
    tempo_dedup_a = time.time() - t0
    print(f"   -> Versão A (Tardia) concluída em {tempo_dedup_a:.2f}s | Novos cadastrados: {len(novos_a)} (3 abas abertas em vão)")

    # Versão B: Prévia (Filtra a lista no Python antes de abrir qualquer página no Playwright)
    print("[4/4] Executando VERSÃO B (Deduplicação Prévia: filtra antes no SQLite e só abre os novos)...")
    t0 = time.time()
    novos_b = []
    links_para_extrair = [h for h in amostra_links if h not in banco_links_simulados]
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        context = await browser.new_context(locale="pt-BR")
        await context.route("**/*", interceptar_rotas_otimizadas)
        sem = asyncio.Semaphore(3)
        tasks = [extrair_lugar_versao_b(context, h, sem) for h in links_para_extrair]
        for res in await asyncio.gather(*tasks):
            if res:
                novos_b.append(res)
        await browser.close()
    tempo_dedup_b = time.time() - t0
    ganho_dedup = ((tempo_dedup_a - tempo_dedup_b) / tempo_dedup_a) * 100 if tempo_dedup_a > 0 else 0
    print(f"   -> Versão B (Prévia) concluída em {tempo_dedup_b:.2f}s | Novos cadastrados: {len(novos_b)} (Zero abas abertas em vão)")
    print(f"   -> GANHO DE VELOCIDADE: {ganho_dedup:.1f}% mais rápido em re-buscas!")

    relatorio["teste_2"] = {
        "tempo_a": tempo_dedup_a,
        "tempo_b": tempo_dedup_b,
        "novos_a": len(novos_a),
        "novos_b": len(novos_b),
        "ganho_pct": ganho_dedup,
    }

    # -------------------------------------------------------------------------
    # TESTE 4: POOL DE ABAS REUTILIZÁVEIS vs CRIAÇÃO/FECHAMENTO CONTÍNUO
    # -------------------------------------------------------------------------
    print("\n" + "-" * 75)
    print(">> TESTE 4: Pool de Abas Reutilizáveis vs Criação/Fechamento a cada Lead")
    print("-" * 75)

    # Versão A: Criando e destruindo página para cada lead
    t0 = time.time()
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        context = await browser.new_context(locale="pt-BR")
        await context.route("**/*", interceptar_rotas_otimizadas)
        sem = asyncio.Semaphore(3)
        tasks = [extrair_lugar_versao_b(context, h, sem) for h in amostra_links]
        leads_aba_a = [r for r in await asyncio.gather(*tasks) if r]
        await browser.close()
    tempo_pool_a = time.time() - t0
    print(f"   -> Versão A (Criar/fechar 6 abas individuais): {tempo_pool_a:.2f}s")

    # Versão B: Pool de 3 abas fixas reutilizadas
    t0 = time.time()
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        context = await browser.new_context(locale="pt-BR")
        await context.route("**/*", interceptar_rotas_otimizadas)
        leads_aba_b = await extrair_com_pool_de_abas(context, amostra_links, num_abas=3)
        await browser.close()
    tempo_pool_b = time.time() - t0
    ganho_pool = ((tempo_pool_a - tempo_pool_b) / tempo_pool_a) * 100 if tempo_pool_a > 0 else 0
    print(f"   -> Versão B (Pool de 3 abas persistentes): {tempo_pool_b:.2f}s")
    print(f"   -> GANHO DE VELOCIDADE: {ganho_pool:.1f}% de ganho por redução de overhead de abas!")

    relatorio["teste_4"] = {
        "tempo_a": tempo_pool_a,
        "tempo_b": tempo_pool_b,
        "ganho_pct": ganho_pool,
    }

    # -------------------------------------------------------------------------
    # TESTE 5: ANÁLISE DE EFICIÊNCIA DE WHATSAPP
    # -------------------------------------------------------------------------
    print("\n" + "-" * 75)
    print(">> TESTE 5: Análise e Filtragem de WhatsApp")
    print("-" * 75)

    todos_leads = resultados_b
    com_whatsapp = []
    apenas_fixo = []
    sem_telefone = []

    for l in todos_leads:
        tel = l.get("Phone", "")
        info = telefone_util.processar_multiplos_telefones(tel)
        if info["tem_whatsapp"]:
            com_whatsapp.append({
                "nome": l.get("Title"),
                "tel": info["telefone_principal"],
                "wa_link": f"https://wa.me/55{telefone_util.limpar_digitos(info['telefone_principal'])}"
            })
        elif info["tipo_telefone"] == "fixo":
            apenas_fixo.append({"nome": l.get("Title"), "tel": info["telefone_principal"]})
        else:
            sem_telefone.append(l.get("Title"))

    total_extraidos = len(todos_leads)
    taxa_wpp = (len(com_whatsapp) / total_extraidos * 100) if total_extraidos > 0 else 0

    print(f"   -> Total de leads analisados: {total_extraidos}")
    print(f"   -> Com WhatsApp (Celular direto): {len(com_whatsapp)} ({taxa_wpp:.1f}%)")
    print(f"   -> Apenas Telefone Fixo (Ignorados no filtro): {len(apenas_fixo)}")
    print(f"   -> Sem telefone informado: {len(sem_telefone)}")

    for idx, w in enumerate(com_whatsapp, start=1):
        print(f"      [{idx}] {w['nome']} -> {w['tel']} -> {w['wa_link']}")

    relatorio["whatsapp"] = {
        "total": total_extraidos,
        "com_whatsapp": len(com_whatsapp),
        "apenas_fixo": len(apenas_fixo),
        "taxa_wpp_pct": taxa_wpp
    }

    print("\n" + "=" * 75)
    print("                   RESUMO FINAL DOS BENCHMARKS")
    print("=" * 75)
    print(f"1. Bloqueio de Imagens/Fontes: {relatorio['teste_1_3']['tempo_a']:.2f}s -> {relatorio['teste_1_3']['tempo_b']:.2f}s ({relatorio['teste_1_3']['ganho_tempo_pct']:.1f}% mais rápido)")
    print(f"2. Deduplicação Prévia no Banco: {relatorio['teste_2']['tempo_a']:.2f}s -> {relatorio['teste_2']['tempo_b']:.2f}s ({relatorio['teste_2']['ganho_pct']:.1f}% mais rápido)")
    print(f"3. Pool de Abas Fixas: {relatorio['teste_4']['tempo_a']:.2f}s -> {relatorio['teste_4']['tempo_b']:.2f}s ({relatorio['teste_4']['ganho_pct']:.1f}% mais rápido)")
    print(f"4. Taxa de WhatsApp Direto: {relatorio['whatsapp']['taxa_wpp_pct']:.1f}% dos estabelecimentos com celular acionável")
    print("=" * 75)


if __name__ == "__main__":
    asyncio.run(executar_benchmark())
