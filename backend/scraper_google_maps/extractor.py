import re
import urllib.parse


def _clean(text: str) -> str:
    if not text:
        return ""
    cleaned = re.sub(r'[\uE000-\uF8FF]', '', text)
    cleaned = cleaned.strip().strip(',').strip()
    return cleaned


async def extract_lead_data_async(page, url: str, title: str = "") -> dict:
    """
    Extrai todos os dados do estabelecimento em UMA ÚNICA chamada de JavaScript nativa,
    garantindo velocidade máxima e latência quase nula.
    """
    page_url = page.url or url or ""
    
    # 1. Extração prioritária de coordenadas reais do lugar via URL (!3d!4d)
    lat = 0.0
    lng = 0.0
    for u in [page_url, url]:
        if not u:
            continue
        match_3d = re.search(r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)', u)
        if match_3d:
            lat = float(match_3d.group(1))
            lng = float(match_3d.group(2))
            break

    # 2. Executa a extração DOM em lote no navegador
    try:
        data = await page.evaluate('''() => {
            const clean = (t) => t ? t.replace(/[\\uE000-\\uF8FF]/g, '').trim().replace(/^,|,$/g, '').trim() : '';
            
            // Title
            let title = '';
            const h1 = document.querySelector('h1');
            if (h1) title = clean(h1.innerText);
            if (!title && document.title) {
                const pt = document.title.split(' - Google Maps')[0].split(' · ')[0];
                if (pt && !pt.includes('Google Maps')) title = clean(pt);
            }
            
            // Category
            let category = '';
            const catEl = document.querySelector('button[jsaction*="category"], button[jsaction*="rating.category"], span[jslog*="category"], div[jslog*="pane.rating.category"]');
            if (catEl) category = clean(catEl.innerText);
            if (!category && document.title && document.title.includes('·')) {
                const parts = document.title.split('·');
                if (parts.length >= 2) category = clean(parts[1]);
            }
            
            // Address
            let address = '';
            const addrEl = document.querySelector('[data-item-id="address"], [aria-label^="Endere"], [aria-label^="Address"]');
            if (addrEl) {
                address = clean(addrEl.innerText.replace(/\\n/g, ', '));
                address = address.replace(/^(Endereço:\\s*|Address:\\s*)/i, '');
            }
            
            // Phone
            const phones = [];
            const phoneEls = document.querySelectorAll('[data-item-id^="phone:tel:"], [aria-label^="Telefone"], [aria-label^="Phone"], a[href^="tel:"]');
            phoneEls.forEach(el => {
                let txt = clean(el.innerText.replace(/\\n/g, ' ')).replace(/^(Telefone:\\s*|Phone:\\s*|Tel:\\s*|Contato:\\s*)/i, '');
                if (txt && !phones.includes(txt)) phones.push(txt);
                const href = el.getAttribute('href');
                if (href && href.startsWith('tel:')) {
                    const num = href.replace('tel:', '').trim();
                    if (num && !phones.includes(num)) phones.push(num);
                }
            });
            const phone = phones.join(' / ');
            
            // Website
            let website = '';
            const webEl = document.querySelector('[data-item-id="authority"], a[data-item-id="authority"]');
            if (webEl) website = webEl.getAttribute('href') || clean(webEl.innerText);
            
            // Rating
            let rating = '';
            const starEl = document.querySelector('span[aria-label*="estrela"], span[aria-label*="star"], div[aria-label*="estrela"], div[aria-label*="star"]');
            if (starEl) {
                const lbl = starEl.getAttribute('aria-label') || '';
                const parts = lbl.trim().split(' ');
                if (parts.length > 0) rating = parts[0].replace(',', '.');
            }
            
            // Reviews
            let reviews = '';
            const revEl = document.querySelector('span[aria-label*="avalia"], span[aria-label*="review"], button[aria-label*="avalia"], button[aria-label*="review"]');
            if (revEl) {
                const lbl = revEl.getAttribute('aria-label') || '';
                const parts = lbl.trim().split(' ');
                if (parts.length > 0) reviews = parts[0].replace(/\\./g, '').replace(/,/g, '');
            }
            
            // Photo
            let foto_url = '';
            const fotoEl = document.querySelector('button[jsaction*="heroHeaderImage"] img, button[aria-label*="Foto"] img, img[src*="googleusercontent.com/p/"], div.m6QErb img[src*="googleusercontent.com"]');
            if (fotoEl) {
                const src = fotoEl.getAttribute('src') || '';
                if (src.startsWith('http')) {
                    foto_url = src.replace(/=w\\d+-h\\d+.*$/, '=w600-h400-k-no');
                    if (!foto_url.endsWith('-k-no')) foto_url = src;
                }
            }
            
            return {
                Title: title,
                Address: address,
                Phone: phone,
                Website: website,
                Rating: rating,
                Reviews: reviews,
                Category: category,
                FotoUrl: foto_url,
                PageUrl: window.location.href
            };
        }''')
    except Exception:
        data = {}

    if not isinstance(data, dict):
        data = {}

    # Fallback de coordenadas via @lat,lng caso não tenha encontrado !3d!4d
    if lat == 0.0 and lng == 0.0:
        for u in [page_url, url]:
            if not u:
                continue
            match_at = re.search(r'@(-?\d+\.\d+),(-?\d+\.\d+)', u)
            if match_at:
                lat = float(match_at.group(1))
                lng = float(match_at.group(2))
                break

    # Fallback de título pelo path do URL
    final_title = data.get('Title') or title or ''
    if not final_title:
        for u in [page_url, url]:
            m_path = re.search(r'/maps/place/([^/]+)/', u)
            if m_path:
                final_title = urllib.parse.unquote_plus(m_path.group(1)).replace('+', ' ').strip()
                break

    return {
        'Title': final_title,
        'Address': data.get('Address') or '',
        'Phone': data.get('Phone') or '',
        'Website': data.get('Website') or '',
        'Url': page_url,
        'Rating': data.get('Rating') or '',
        'Reviews': data.get('Reviews') or '',
        'Category': data.get('Category') or '',
        'Lat': lat,
        'Lng': lng,
        'FotoUrl': data.get('FotoUrl') or ''
    }
