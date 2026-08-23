import re
import urllib.parse


def _clean(text: str) -> str:
    """Remove Google Maps icon characters (Unicode Private Use Area) and extra whitespace."""
    if not text:
        return ""
    cleaned = re.sub(r'[\uE000-\uF8FF]', '', text)
    cleaned = cleaned.strip().strip(',').strip()
    return cleaned


def extract_lead_data(page, url, title=""):
    raise NotImplementedError("Use extract_lead_data_async for async Playwright.")


async def extract_lead_data_async(page, url: str, title: str = "") -> dict:
    """
    Async version: extracts business details from the open place page in Google Maps.
    """
    address = ""
    phone = ""
    website = ""
    rating = ""
    reviews = ""
    category = ""
    lat = 0.0
    lng = 0.0

    # --- Title ---
    if not title:
        try:
            h1_el = await page.query_selector('h1')
            if h1_el:
                title = _clean(await h1_el.inner_text())
        except Exception:
            pass

    # --- Category ---
    try:
        cat_el = (
            await page.query_selector('button[jsaction*="category"], button[jsaction*="rating.category"]')
            or await page.query_selector('span[jslog*="category"]')
            or await page.query_selector('div[jslog*="pane.rating.category"]')
        )
        if cat_el:
            category = _clean(await cat_el.inner_text())
        # Fallback: extrai do aria-label da página (frequentemente contém categoria)
        if not category:
            title_el = await page.query_selector('title')
            if title_el:
                title_text = await title_el.inner_text()
                # Formato comum: "Nome do Lugar · Categoria"
                if '·' in title_text:
                    parts = title_text.split('·')
                    if len(parts) >= 2:
                        category = _clean(parts[1].strip())
    except Exception:
        pass

    # --- Address ---
    try:
        addr_el = (
            await page.query_selector('[data-item-id="address"]')
            or await page.query_selector('[aria-label^="Endere"]')
            or await page.query_selector('[aria-label^="Address"]')
        )
        if addr_el:
            address = _clean((await addr_el.inner_text()).replace('\n', ', '))
            for prefix in ["Endere\u00e7o: ", "Address: "]:
                if address.startswith(prefix):
                    address = address[len(prefix):]
    except Exception:
        pass

    # --- Phones (Multiple) ---
    phones_encontrados = []
    try:
        phone_els = await page.query_selector_all(
            '[data-item-id^="phone:tel:"], [aria-label^="Telefone"], [aria-label^="Phone"], a[href^="tel:"]'
        )
        for p_el in phone_els:
            # Tenta pegar o texto e o href se for link
            p_text = _clean((await p_el.inner_text()).replace('\n', ' '))
            for prefix in ["Telefone: ", "Phone: ", "Tel: ", "Contato: "]:
                if p_text.startswith(prefix):
                    p_text = p_text[len(prefix):]
            if p_text and p_text not in phones_encontrados:
                phones_encontrados.append(p_text)

            href_tel = await p_el.get_attribute('href')
            if href_tel and href_tel.startswith('tel:'):
                num_href = href_tel.replace('tel:', '').strip()
                if num_href and num_href not in phones_encontrados:
                    phones_encontrados.append(num_href)
    except Exception:
        pass

    phone = " / ".join(phones_encontrados) if phones_encontrados else ""

    # --- Website ---
    try:
        web_el = (
            await page.query_selector('[data-item-id="authority"]')
            or await page.query_selector('a[data-item-id="authority"]')
        )
        if web_el:
            website = await web_el.get_attribute('href') or _clean(await web_el.inner_text())
    except Exception:
        pass

    # --- Rating ---
    try:
        star_el = await page.query_selector(
            'span[aria-label*="estrela"], span[aria-label*="star"], '
            'div[aria-label*="estrela"], div[aria-label*="star"]'
        )
        if star_el:
            lbl = await star_el.get_attribute('aria-label') or ''
            parts = lbl.strip().split(' ')
            if parts:
                rating = parts[0].replace(',', '.')
    except Exception:
        pass

    # --- Reviews ---
    try:
        review_el = await page.query_selector(
            'span[aria-label*="avalia"], span[aria-label*="review"], '
            'button[aria-label*="avalia"], button[aria-label*="review"]'
        )
        if review_el:
            lbl = await review_el.get_attribute('aria-label') or ''
            parts = lbl.strip().split(' ')
            if parts:
                reviews = parts[0].replace('.', '').replace(',', '')
    except Exception:
        pass

    # --- Photo / Cover Image ---
    foto_url = ""
    try:
        foto_el = (
            await page.query_selector('button[jsaction*="heroHeaderImage"] img')
            or await page.query_selector('button[aria-label*="Foto"] img')
            or await page.query_selector('img[src*="googleusercontent.com/p/"]')
            or await page.query_selector('div.m6QErb img[src*="googleusercontent.com"]')
        )
        if foto_el:
            src = await foto_el.get_attribute("src") or ""
            # Converte para resolução maior se for thumbnail pequeno (w...-h...)
            if src.startswith("http"):
                foto_url = re.sub(r'=w\d+-h\d+.*$', '=w600-h400-k-no', src)
                if not foto_url.endswith('-k-no'):
                    foto_url = src
    except Exception:
        pass

    # --- Extract Lat / Lng from multiple sources ---
    # PRIORIDADE: !3d{lat}!4d{lng} é a coordenada REAL do estabelecimento.
    # @{lat},{lng} é a posição da CÂMERA do mapa, não do lugar — usar só como último fallback.
    urls_to_check = [page.url, url]
    
    # Tentativa 1: !3d!4d no URL atual (mais confiável)
    for u in urls_to_check:
        if not u:
            continue
        match_3d = re.search(r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)', u)
        if match_3d:
            lat, lng = float(match_3d.group(1)), float(match_3d.group(2))
            break

    # Tentativa 2: meta tag (confiável, contém coordenada do negocio)
    if lat == 0.0 and lng == 0.0:
        try:
            meta_el = await page.query_selector('meta[itemprop="image"]')
            if meta_el:
                content = await meta_el.get_attribute("content") or ""
                match_meta = re.search(r'center=(-?\d+\.\d+)%2C(-?\d+\.\d+)', content)
                if match_meta:
                    lat, lng = float(match_meta.group(1)), float(match_meta.group(2))
        except Exception:
            pass

    # Tentativa 3: @lat,lng no URL (posição da câmera, menos preciso mas melhor que 0)
    if lat == 0.0 and lng == 0.0:
        for u in urls_to_check:
            if not u:
                continue
            match_at = re.search(r'@(-?\d+\.\d+),(-?\d+\.\d+)', u)
            if match_at:
                lat, lng = float(match_at.group(1)), float(match_at.group(2))
                break

    return {
        'Title': title,
        'Address': address,
        'Phone': phone,
        'Website': website,
        'Url': page.url or url,
        'Rating': rating,
        'Reviews': reviews,
        'Category': category,
        'Lat': lat,
        'Lng': lng,
        'FotoUrl': foto_url
    }


