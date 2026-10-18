"""
whatsapp_playwright.py — Automação Real do WhatsApp Web via Playwright Chromium.
Gerencia sessão persistente, captura de QR Code ao vivo, detecção de conexão e
despacho de mensagens da fila.
"""
import base64
import logging
import queue
import threading
import time
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

import db
from telefone_util import limpar_digitos

logger = logging.getLogger(__name__)

# Estado do serviço Playwright WhatsApp
_estado = {
    "ativo": False,
    "conectado": False,
    "tem_qr": False,
    "qr_base64": None,
    "telefone_conectado": None,
    "ultima_atividade": None,
    "erro": None,
}
_lock = threading.Lock()
_worker_thread: Optional[threading.Thread] = None
_parar_evento = threading.Event()
_fila_pedidos_diretos: queue.Queue = queue.Queue()
_callback_mensagem_recebida: Optional[Callable[[str, str], None]] = None
_mensagens_processadas: set = set()
_ultimo_scan_leitor: float = 0.0

# Referências Playwright
_playwright = None
_contexto = None
_pagina = None


def obter_estado() -> dict:
    with _lock:
        est = dict(_estado)
        est["envio_automatico"] = (db.obter_config("whatsapp_envio_automatico") == "1")
        return est


def _atualizar_estado(**kw):
    with _lock:
        _estado.update(kw)
        _estado["ultima_atividade"] = datetime.now().isoformat(timespec="seconds")


def get_whatsapp_data_dir() -> Path:
    pasta = db.get_data_dir() / "whatsapp_web_session"
    pasta.mkdir(parents=True, exist_ok=True)
    return pasta


# ---------------------------------------------------------------------------
# Leitor Autônomo de Mensagens Recebidas & Filtro de Segurança
# ---------------------------------------------------------------------------

def _obter_telefones_leads_validos() -> set:
    """Carrega os telefones normalizados dos leads no CRM e na fila para filtrar spam/contatos pessoais."""
    conn = db.conectar()
    telefones = set()
    try:
        linhas = conn.execute("SELECT telefone FROM leads WHERE telefone IS NOT NULL AND telefone != ''").fetchall()
        for r in linhas:
            dig = limpar_digitos(r["telefone"])
            if dig:
                telefones.add(dig)
                if dig.startswith("55"):
                    telefones.add(dig[2:])
                else:
                    telefones.add("55" + dig)

        linhas_f = conn.execute("SELECT telefone FROM fila_whatsapp WHERE telefone IS NOT NULL").fetchall()
        for r in linhas_f:
            dig = limpar_digitos(r["telefone"])
            if dig:
                telefones.add(dig)
                if dig.startswith("55"):
                    telefones.add(dig[2:])
                else:
                    telefones.add("55" + dig)
    except Exception as e:
        logger.warning("Erro ao consultar leads válidos para recebimento: %s", e)
    finally:
        conn.close()
    return telefones


def _escanear_mensagens_recebidas(pagina, callback: Optional[Callable[[str, str], None]]):
    """Escaneia o chat ativo e a barra lateral em busca de mensagens recebidas de leads."""
    global _mensagens_processadas, _ultimo_scan_leitor
    if not callback:
        return

    agora = time.time()
    if agora - _ultimo_scan_leitor < 2.5:
        return
    _ultimo_scan_leitor = agora

    telefones_leads = _obter_telefones_leads_validos()

    # 1. Checa a conversa atualmente aberta (#main)
    try:
        dados_chat = pagina.evaluate(r"""
        () => {
            const main = document.querySelector('#main, div[data-testid="conversation-panel-messages"], div[data-testid="conversation-panel"]');
            if (!main) return null;

            // Busca título ou número no header do chat aberto
            const headerEl = main.querySelector('header span[title]') || 
                             main.querySelector('header [data-testid="conversation-info-header"] span') ||
                             main.querySelector('header span[dir="auto"]') ||
                             main.querySelector('header h2');
            
            let nomeOuNumero = headerEl ? (headerEl.getAttribute('title') || headerEl.innerText || '').trim() : '';
            if (!nomeOuNumero) {
                const hText = main.querySelector('header')?.innerText || '';
                const lines = hText.split('\n').map(s => s.trim()).filter(s => s && s.length > 1 && !['online', 'digitando', 'visto por último', 'clique aqui'].some(k => s.toLowerCase().includes(k)));
                nomeOuNumero = lines[0] || '';
            }

            // Busca todas as bolhas de mensagens
            const containers = Array.from(main.querySelectorAll('div[data-testid="msg-container"]'));
            const msgs = [];
            const mainRect = main.getBoundingClientRect();

            // 1. REGRA CRÍTICA ANTI-DUPLICAÇÃO / ANTI-ECO:
            // Checa quem enviou a ÚLTIMA mensagem exibida no chat ativo
            if (containers.length > 0) {
                const ultimo = containers[containers.length - 1];
                const ultimoHasCheck = !!ultimo.querySelector('[data-icon*="check"], [data-icon*="dblcheck"], [data-icon="status-v"], [data-testid="msg-check"], [data-testid="msg-dblcheck"]');
                const ultimoIsTailOut = !!ultimo.querySelector('span[data-icon*="tail-out"]');
                const uRect = ultimo.getBoundingClientRect();
                const uDistEsq = uRect.left - mainRect.left;
                const uDistDir = mainRect.right - uRect.right;
                const uContainerWithId = ultimo.closest('[data-id]') || ultimo.querySelector('[data-id]') || ultimo;
                const uDataId = uContainerWithId ? (uContainerWithId.getAttribute('data-id') || '') : '';

                // Se a última mensagem foi enviada por NÓS (lado direito, check, tail-out ou fromMe: true)
                const ultimoEhMeu = ultimoIsTailOut || ultimoHasCheck || (uDistEsq > uDistDir) || uDataId.startsWith('true_');
                if (ultimoEhMeu) {
                    // Já enviamos a última mensagem deste chat! Estamos aguardando o cliente responder.
                    const todasIds = containers.map(c => {
                        const el = c.closest('[data-id]') || c.querySelector('[data-id]') || c;
                        return el ? el.getAttribute('data-id') : null;
                    }).filter(Boolean);

                    return {
                        header: nomeOuNumero,
                        aguardando_resposta_lead: true,
                        total_bolhas: containers.length,
                        mensagens: [],
                        todas_ids: todasIds
                    };
                }
            }

            containers.forEach(c => {
                // Checa indicadores de mensagem enviada por mim vs recebida do lead
                const hasCheck = !!c.querySelector('[data-icon*="check"], [data-icon*="dblcheck"], [data-icon="status-v"], [data-testid="msg-check"], [data-testid="msg-dblcheck"]');
                const isTailIn = !!c.querySelector('span[data-icon*="tail-in"]');
                const isTailOut = !!c.querySelector('span[data-icon*="tail-out"]');
                const rect = c.getBoundingClientRect();
                const distEsquerda = rect.left - mainRect.left;
                const distDireita = mainRect.right - rect.right;

                // Mensagens recebidas do lead ficam posicionadas à esquerda (distEsquerda < distDireita e distEsquerda < 150)
                const isIncoming = isTailIn || (!isTailOut && !hasCheck && (distEsquerda < distDireita) && distEsquerda < 150);

                if (!isIncoming) {
                    return; // Ignora mensagens enviadas por mim (outbound)
                }

                const containerWithId = c.closest('[data-id]') || c.querySelector('[data-id]') || c;
                const dataId = containerWithId ? (containerWithId.getAttribute('data-id') || '') : '';

                if (dataId.startsWith('true_')) {
                    return; // 'true_' no WhatsApp Web significa fromMe: true
                }

                // Ignora mensagens de grupos (@g.us)
                if (dataId.includes('@g.us')) return;

                let tel = '';
                const m = dataId.match(/_(\d+)@c\.us/);
                if (m) {
                    tel = m[1];
                }

                const copyable = c.querySelector('.copyable-text');
                let texto = '';
                if (copyable) {
                    const selectable = copyable.querySelector('.selectable-text');
                    texto = (selectable ? selectable.innerText : copyable.innerText) || '';
                } else {
                    const span = c.querySelector('.selectable-text, span[dir]');
                    texto = (span ? span.innerText : c.innerText) || '';
                }

                texto = texto.trim();
                if (texto) {
                    const idFinal = (dataId && dataId.length > 5) ? dataId : ('msg_' + texto + '_' + Math.round(rect.top));
                    msgs.push({
                        dataId: idFinal,
                        telefone: tel,
                        texto: texto
                    });
                }
            });

            return {
                header: nomeOuNumero,
                total_bolhas: containers.length,
                mensagens: msgs
            };
        }
        """)

        if dados_chat:
            todas_ids = dados_chat.get("todas_ids") or []
            if todas_ids:
                _mensagens_processadas.update(todas_ids)

            header_str = (dados_chat.get("header") or "").strip()
            # Se ainda estiver carregando os dados do contato no header, aguarda o próximo ciclo
            if not header_str or "clique para mostrar" in header_str.lower():
                header_str = ""

            msgs = dados_chat.get("mensagens", [])
            if msgs and header_str:
                logger.info("Chat ativo detectado: '%s' com %s mensagem(ns) recebida(s)", header_str, len(msgs))

            for m in msgs:
                data_id = m["dataId"]
                if data_id in _mensagens_processadas:
                    continue

                tel = m.get("telefone") or limpar_digitos(header_str)
                texto = m["texto"]

                if not tel or len(tel) < 8:
                    if not header_str:
                        continue
                    # Se não veio no data-id nem no header numérico, testa candidatos pelo nome (split por quebra de linha)
                    candidatos = [p.strip() for p in header_str.split("\n") if p.strip()]
                    conn = db.conectar()
                    try:
                        for cand in candidatos:
                            if not cand:
                                continue
                            linha = conn.execute(
                                "SELECT telefone FROM leads WHERE (nome LIKE ? OR place_id LIKE ?) AND telefone IS NOT NULL LIMIT 1",
                                (f"%{cand}%", f"%{cand}%")
                            ).fetchone()
                            if linha and linha["telefone"]:
                                tel = linha["telefone"]
                                break

                            linha_f = conn.execute(
                                "SELECT telefone FROM fila_whatsapp WHERE nome LIKE ? AND telefone IS NOT NULL LIMIT 1",
                                (f"%{cand}%",)
                            ).fetchone()
                            if linha_f and linha_f["telefone"]:
                                tel = linha_f["telefone"]
                                break
                    finally:
                        conn.close()

                if not tel:
                    continue

                # FILTRO DE SEGURANÇA MÁXIMA: Garante que só responderá a contatos que são LEADS
                tel_norm = limpar_digitos(tel)
                eh_lead = any(t in telefones_leads for t in (tel_norm, tel_norm.replace("55", "", 1) if tel_norm.startswith("55") else "55" + tel_norm))

                if not eh_lead:
                    logger.debug("Mensagem recebida de contato não registrado como lead (+%s). Ignorando por segurança anti-mistura.", tel)
                    continue

                # Marca como processada com segurança agora que o lead foi confirmado
                _mensagens_processadas.add(data_id)
                if len(_mensagens_processadas) > 5000:
                    _mensagens_processadas.clear()

                logger.info("Nova mensagem recebida de Lead +%s: '%s'", tel, texto)
                callback(tel, texto)

    except Exception as e_scan:
        logger.debug("Erro ao escanear chat ativo: %s", e_scan)

    # 2. Checa se há outros chats na lista lateral (#pane-side) com badge de mensagens não lidas
    # OU se o chat principal (#main) não está aberto e há leads na lista
    try:
        contatos_nao_lidos = pagina.evaluate(r"""
        () => {
            const side = document.querySelector('#pane-side');
            if (!side) return [];

            const rows = Array.from(side.querySelectorAll('div[role="listitem"], div[role="row"], div[tabindex="-1"], div[data-testid="cell-frame-container"]'));
            const main = document.querySelector('#main');
            const nomes = [];

            for (let row of rows) {
                const text = row.innerText || '';
                if (text.toLowerCase().includes('arquivada')) continue;

                const badge = row.querySelector('[aria-label*="não lid"], [aria-label*="unread"], [data-testid*="unread"], [data-testid="icon-unread-count"]');
                if (badge) {
                    const titleEl = row.querySelector('span[title], [dir="auto"]');
                    const title = titleEl ? (titleEl.getAttribute('title') || titleEl.innerText || '').trim() : '';
                    if (title && !nomes.includes(title)) {
                        nomes.push(title);
                    }
                }
            }
            return nomes;
        }
        """)

        if contatos_nao_lidos:
            for nome_ou_num in contatos_nao_lidos:
                # Tenta resolver o telefone do lead
                dig = limpar_digitos(nome_ou_num)
                tel_lead = None
                if dig and len(dig) >= 8:
                    tel_lead = dig
                else:
                    candidatos = [p.strip() for p in nome_ou_num.split("\n") if p.strip()]
                    conn = db.conectar()
                    try:
                        for cand in candidatos:
                            if not cand:
                                continue
                            linha = conn.execute(
                                "SELECT telefone FROM leads WHERE (nome LIKE ? OR place_id LIKE ?) AND telefone IS NOT NULL LIMIT 1",
                                (f"%{cand}%", f"%{cand}%")
                            ).fetchone()
                            if linha and linha["telefone"]:
                                tel_lead = limpar_digitos(linha["telefone"])
                                break
                            linha_f = conn.execute(
                                "SELECT telefone FROM fila_whatsapp WHERE nome LIKE ? AND telefone IS NOT NULL LIMIT 1",
                                (f"%{cand}%",)
                            ).fetchone()
                            if linha_f and linha_f["telefone"]:
                                tel_lead = limpar_digitos(linha_f["telefone"])
                                break
                    finally:
                        conn.close()

                if tel_lead:
                    tel_norm = limpar_digitos(tel_lead)
                    eh_lead = any(t in telefones_leads for t in (tel_norm, tel_norm.replace("55", "", 1) if tel_norm.startswith("55") else "55" + tel_norm))
                    if eh_lead:
                        if not tel_norm.startswith("55") and len(tel_norm) in (10, 11):
                            tel_norm = "55" + tel_norm
                        logger.info("Abrindo conversa do lead com mensagem não lida: +%s (%s)", tel_norm, nome_ou_num)
                        
                        clicou = False
                        try:
                            clicou = pagina.evaluate(r"""
                            (identificador) => {
                                const side = document.querySelector('#pane-side');
                                if (!side) return false;
                                const rows = Array.from(side.querySelectorAll('div[role="listitem"], div[role="row"], div[tabindex="-1"], div[data-testid="cell-frame-container"]'));
                                const idLower = identificador.toLowerCase();
                                for (let r of rows) {
                                    const t = (r.innerText || '').toLowerCase();
                                    if (t.includes(idLower) || (idLower.length > 3 && idLower.includes(t))) {
                                        const target = r.querySelector('div[role="gridcell"], div[tabindex="-1"]') || r;
                                        ['mousedown', 'mouseup', 'click'].forEach(evt => {
                                            target.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
                                        });
                                        return true;
                                    }
                                }
                                return false;
                            }
                            """, nome_ou_num)
                        except Exception:
                            clicou = False

                        if not clicou:
                            # Se não achou na lista visível, usa a barra de busca nativa do WhatsApp
                            try:
                                search_box = pagina.locator("#side div[contenteditable='true'], #side div[role='textbox']").first
                                if search_box.is_visible():
                                    search_box.click()
                                    search_box.fill(tel_norm)
                                    time.sleep(0.8)
                                    pagina.keyboard.press("Enter")
                                    time.sleep(1.5)
                            except Exception as e_busca:
                                logger.debug("Não foi possível usar a busca para abrir chat: %s", e_busca)
                        break
    except Exception as e_badge:
        logger.debug("Erro ao verificar badges não lidas: %s", e_badge)


# ---------------------------------------------------------------------------
# Loop Principal do Worker Playwright
# ---------------------------------------------------------------------------

def _executar_worker_whatsapp(ao_receber_mensagem: Optional[Callable[[str, str], None]] = None):
    global _playwright, _contexto, _pagina
    from playwright.sync_api import sync_playwright

    logger.info("Iniciando Playwright Chromium para WhatsApp Web...")
    _atualizar_estado(ativo=True, conectado=False, tem_qr=False, erro=None)

    data_dir = str(get_whatsapp_data_dir())

    try:
        _playwright = sync_playwright().start()
        _contexto = _playwright.chromium.launch_persistent_context(
            user_data_dir=data_dir,
            headless=True,
            viewport={"width": 1280, "height": 850},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage"
            ],
            timeout=45000,
        )

        _pagina = _contexto.pages[0] if _contexto.pages else _contexto.new_page()
        _pagina.on("dialog", lambda d: d.accept())
        _pagina.goto("https://web.whatsapp.com", wait_until="domcontentloaded")
        logger.info("WhatsApp Web carregado. Aguardando autenticação ou QR Code...")

        # Loop de inicialização e monitoramento
        while not _parar_evento.is_set():
            # 1. Verifica se já está conectado (lista de conversas visível)
            esta_conectado = False
            try:
                pane = _pagina.locator("#pane-side, [data-testid='chat-list'], header[data-testid='chatlist-header']")
                if pane.count() > 0 and pane.first.is_visible():
                    esta_conectado = True
            except Exception:
                pass

            if esta_conectado:
                if not obter_estado().get("conectado"):
                    logger.info("WhatsApp Web CONECTADO e autenticado com sucesso!")
                    _atualizar_estado(conectado=True, tem_qr=False, qr_base64=None, erro=None)

                # Fecha popups e modais intrusivos automaticamente (ex: ativar notificações)
                try:
                    modal = _pagina.locator("div[role='dialog']")
                    if modal.count() > 0 and modal.first.is_visible():
                        _pagina.keyboard.press("Escape")
                except Exception:
                    pass

                # Processa primeiro pedidos diretos prioritários (ex: disparos manuais / testes com IA)
                _processar_pedidos_diretos(_pagina)

                # Escaneia mensagens recebidas e notificações não lidas de leads
                cb_ativo = ao_receber_mensagem or _callback_mensagem_recebida
                if cb_ativo:
                    _escanear_mensagens_recebidas(_pagina, cb_ativo)

                # SEGURANÇA: Só despacha da fila geral se o envio automático estiver explicitamente ATIVADO pelo usuário
                envio_auto_ativo = (db.obter_config("whatsapp_envio_automatico") == "1")
                if envio_auto_ativo:
                    _processar_envios_pendentes(_pagina)

                # Pequena pausa antes de checar novamente
                time.sleep(2)
                continue

            # 2. Se não está conectado, procura pelo QR Code
            try:
                qr_canvas = _pagina.locator("canvas[aria-label*='QR'], canvas, div[data-ref] canvas")
                if qr_canvas.count() > 0 and qr_canvas.first.is_visible():
                    screenshot_bytes = qr_canvas.first.screenshot()
                    b64 = "data:image/png;base64," + base64.b64encode(screenshot_bytes).decode("ascii")
                    _atualizar_estado(conectado=False, tem_qr=True, qr_base64=b64, erro=None)
                    time.sleep(3)
                    continue
            except Exception as e:
                logger.debug("Aguardando renderização do QR Code: %s", e)

            # Verifica botão de recarregar QR Code expirado
            try:
                reload_btn = _pagina.locator("button:has-text('Clique para recarregar'), [data-testid='reload-qr']")
                if reload_btn.count() > 0 and reload_btn.first.is_visible():
                    logger.info("Recarregando QR Code expirado...")
                    reload_btn.first.click()
                    time.sleep(2)
            except Exception:
                pass

            time.sleep(2)

    except Exception as e:
        logger.exception("Erro no worker do WhatsApp Playwright: %s", e)
        _atualizar_estado(ativo=False, conectado=False, tem_qr=False, erro=str(e))
    finally:
        _fechar_recursos()
        _atualizar_estado(ativo=False, conectado=False, tem_qr=False)
        logger.info("Worker do WhatsApp Playwright finalizado.")


def _fechar_recursos():
    global _playwright, _contexto, _pagina
    try:
        if _pagina:
            _pagina.close()
    except Exception:
        pass
    try:
        if _contexto:
            _contexto.close()
    except Exception:
        pass
    try:
        if _playwright:
            _playwright.stop()
    except Exception:
        pass
    _pagina = None
    _contexto = None
    _playwright = None


# ---------------------------------------------------------------------------
# Despachante da Fila
# ---------------------------------------------------------------------------

def _processar_envios_pendentes(pagina):
    """Lê a próxima mensagem pendente na fila e envia pelo WhatsApp Web."""
    conn = db.conectar()
    item = None
    try:
        linha = conn.execute(
            """
            SELECT id, telefone, mensagem, nome
            FROM fila_whatsapp
            WHERE status = 'pendente'
            ORDER BY agendado_para ASC, id ASC
            LIMIT 1
            """
        ).fetchone()
        if linha:
            item = dict(linha)
    finally:
        conn.close()

    if not item:
        return

    item_id = item["id"]
    telefone = limpar_digitos(item["telefone"])
    if not telefone.startswith("55") and len(telefone) in (10, 11):
        telefone = "55" + telefone

    mensagem = item["mensagem"]
    logger.info("Despachando mensagem da fila #%s para WhatsApp +%s...", item_id, telefone)

    # Marca como 'processando'
    conn = db.conectar()
    try:
        conn.execute("UPDATE fila_whatsapp SET status = 'processando', atualizado_em = datetime('now') WHERE id = ?", (item_id,))
        conn.commit()
    finally:
        conn.close()

    sucesso = False
    erro_msg = ""
    try:
        partes = [p.strip() for p in mensagem.split("\n\n") if p.strip()]
        if not partes:
            partes = [mensagem.strip()]
        if len(partes) > 2:
            partes = [partes[0], " ".join(partes[1:])]

        msg_primeira = urllib.parse.quote(partes[0])
        url = f"https://web.whatsapp.com/send?phone={telefone}&text={msg_primeira}"
        pagina.goto(url, wait_until="domcontentloaded", timeout=30000)

        # Aguarda botão de enviar ou caixa de texto
        btn_send = pagina.locator("button[data-testid='compose-btn-send'], span[data-icon='send'], [aria-label='Enviar']")
        btn_send.wait_for(state="visible", timeout=25000)
        time.sleep(1)
        btn_send.click()
        time.sleep(1.5)

        # Se houver mais partes, digita e envia nas bolhas seguintes com delay humanizado
        if len(partes) > 1:
            input_box = pagina.locator("#main footer div[contenteditable='true'], footer div[role='textbox']").first
            for parte in partes[1:]:
                time.sleep(2.0)
                input_box.click()
                input_box.fill(parte)
                time.sleep(0.4)
                pagina.keyboard.press("Enter")

        # Aguarda confirmação do envio
        time.sleep(2.5)
        sucesso = True
        logger.info("Mensagem enviada com sucesso em %d bolha(s) para +%s!", len(partes), telefone)
    except Exception as e:
        erro_msg = str(e)
        logger.warning("Falha ao enviar mensagem para +%s: %s", telefone, e)

    # Atualiza banco com status final
    conn = db.conectar()
    try:
        if sucesso:
            conn.execute(
                """
                UPDATE fila_whatsapp
                SET status = 'enviado', enviado_em = datetime('now'), atualizado_em = datetime('now'), erro = NULL
                WHERE id = ?
                """,
                (item_id,)
            )
        else:
            conn.execute(
                """
                UPDATE fila_whatsapp
                SET status = 'falha', erro = ?, atualizado_em = datetime('now')
                WHERE id = ?
                """,
                (erro_msg[:300], item_id)
            )
        conn.commit()
    finally:
        conn.close()


def _processar_pedidos_diretos(pagina):
    """Executa envios prioritários ou ações customizadas dentro da thread oficial do Playwright."""
    while not _fila_pedidos_diretos.empty():
        try:
            item = _fila_pedidos_diretos.get_nowait()
        except queue.Empty:
            break

        if len(item) == 3 and callable(item[0]):
            func, evento, container = item
            try:
                container["res"] = func(pagina)
                container["ok"] = True
            except Exception as e:
                logger.warning("Erro ao executar ação customizada no navegador: %s", e)
                container["erro"] = str(e)
                container["ok"] = False
            finally:
                evento.set()
            continue

        tel, mensagem, evento, container = item

        logger.info("Executando envio prioritário na thread Playwright para WhatsApp +%s...", tel)
        try:
            # Verifica se o chat com esse lead já está aberto no #main para envio instantâneo sem recarregar a página
            chat_ja_aberto = False
            try:
                main_header = (pagina.locator("#main header").inner_text() or "").lower()
                tel_curto = tel.replace("55", "", 1) if tel.startswith("55") else tel
                if tel in main_header or tel_curto in main_header:
                    chat_ja_aberto = True
                else:
                    conn = db.conectar()
                    try:
                        linha = conn.execute("SELECT nome FROM leads WHERE telefone LIKE ? LIMIT 1", (f"%{tel_curto}%",)).fetchone()
                        if linha and linha["nome"] and linha["nome"].lower() in main_header:
                            chat_ja_aberto = True
                    finally:
                        conn.close()
            except Exception:
                chat_ja_aberto = False

            partes = [p.strip() for p in mensagem.split("\n\n") if p.strip()]
            if not partes:
                partes = [mensagem.strip()]
            if len(partes) > 2:
                partes = [partes[0], " ".join(partes[1:])]

            if chat_ja_aberto:
                input_box = pagina.locator("#main footer div[contenteditable='true'], footer div[role='textbox']").first
                input_box.wait_for(state="visible", timeout=8000)
                for idx, parte in enumerate(partes):
                    if idx > 0:
                        # Intervalo humanizado de digitação entre bolhas de mensagem (1.8 a 2.5s)
                        time.sleep(2.0)
                    input_box.click()
                    input_box.fill(parte)
                    time.sleep(0.4)
                    pagina.keyboard.press("Enter")
                time.sleep(1.5)
                logger.info("Mensagem direta enviada em %d bolha(s) no chat aberto para +%s!", len(partes), tel)
                container["ok"] = True
                container["status"] = "Mensagem enviada com sucesso no chat aberto!"
            else:
                msg_primeira = urllib.parse.quote(partes[0])
                url = f"https://web.whatsapp.com/send?phone={tel}&text={msg_primeira}"
                pagina.goto(url, wait_until="domcontentloaded", timeout=30000)

                btn_send = pagina.locator("button[data-testid='compose-btn-send'], span[data-icon='send'], [aria-label='Enviar']")
                btn_send.wait_for(state="visible", timeout=25000)
                time.sleep(1)
                btn_send.click()
                time.sleep(1.5)

                if len(partes) > 1:
                    input_box = pagina.locator("#main footer div[contenteditable='true'], footer div[role='textbox']").first
                    for parte in partes[1:]:
                        time.sleep(2.0)
                        input_box.click()
                        input_box.fill(parte)
                        time.sleep(0.4)
                        pagina.keyboard.press("Enter")

                time.sleep(2.5)
                logger.info("Mensagem direta enviada em %d bolha(s) para +%s!", len(partes), tel)
                container["ok"] = True
                container["status"] = "Mensagem enviada com sucesso no WhatsApp!"
        except Exception as e:
            logger.warning("Falha ao despachar mensagem direta para +%s: %s", tel, e)
            container["ok"] = False
            container["status"] = str(e)
        finally:
            evento.set()


def despachar_mensagem_direta(telefone: str, mensagem: str, timeout: int = 40) -> tuple[bool, str]:
    """Envia uma mensagem diretamente pelo WhatsApp Web ativo do Playwright de forma thread-safe."""
    if not obter_estado().get("conectado"):
        return False, "WhatsApp Web não está conectado. Conecte pelo QR Code antes de disparar."

    tel = limpar_digitos(telefone)
    if not tel.startswith("55") and len(tel) in (10, 11):
        tel = "55" + tel

    evento = threading.Event()
    container: dict = {}
    _fila_pedidos_diretos.put((tel, mensagem, evento, container))

    if evento.wait(timeout=timeout):
        return container.get("ok", False), container.get("status", "Falha desconhecida no despacho.")
    return False, "Tempo limite excedido aguardando despacho no WhatsApp Web."


def executar_no_navegador(func: Callable[[Any], Any], timeout: int = 15) -> Any:
    """Executa uma função qualquer de inspeção/ação diretamente na thread do Playwright."""
    if not obter_estado().get("conectado"):
        raise RuntimeError("WhatsApp Web não está conectado.")

    evento = threading.Event()
    container: dict = {}
    _fila_pedidos_diretos.put((func, evento, container))
    if evento.wait(timeout=timeout):
        if container.get("ok"):
            return container.get("res")
        raise RuntimeError(container.get("erro", "Erro ao executar no navegador"))
    raise TimeoutError("Tempo limite excedido na execução do navegador.")


def limpar_memoria_mensagens():
    """Limpa o conjunto de IDs de mensagens já processadas."""
    global _mensagens_processadas
    _mensagens_processadas.clear()
    logger.info("Memória de mensagens processadas foi limpa com sucesso.")


def _limpar_chat_ativo_no_navegador(pagina):
    """Tenta acionar o menu de mais opções do chat ativo e limpar mensagens no WhatsApp Web."""
    try:
        menu_btns = pagina.locator('#main header span[data-icon="menu"], #main header span[data-icon="more-vert"], #main header [data-testid="menu"]')
        if menu_btns.count() > 0:
            menu_btns.last.click(timeout=3000)
            time.sleep(0.8)
            itens = pagina.locator('div[role="application"] div[tabindex="-1"], div[role="menu"] div[role="menuitem"], div[role="listbox"] div, ul[role="menu"] li')
            for i in range(itens.count()):
                t = itens.nth(i).inner_text().strip().lower()
                if 'limpar conversa' in t or 'limpar mensagens' in t or 'apagar conversa' in t:
                    itens.nth(i).click(timeout=3000)
                    time.sleep(0.8)
                    btn_confirma = pagina.locator('div[role="dialog"] button:has-text("Limpar"), div[role="dialog"] button:has-text("Apagar")')
                    if btn_confirma.count() > 0:
                        btn_confirma.first.click(timeout=3000)
                    time.sleep(1)
                    return True
    except Exception as e:
        logger.debug("Tentativa de limpar chat no navegador: %s", e)
    return False


# ---------------------------------------------------------------------------
# Controle de Inicialização / Parada
# ---------------------------------------------------------------------------

def iniciar_sessao_whatsapp(ao_receber_mensagem: Optional[Callable[[str, str], None]] = None) -> bool:
    """Inicia o worker do Playwright em segundo plano se ainda não estiver rodando."""
    global _worker_thread, _callback_mensagem_recebida
    with _lock:
        if ao_receber_mensagem:
            _callback_mensagem_recebida = ao_receber_mensagem

        if _worker_thread and _worker_thread.is_alive():
            logger.info("Worker do WhatsApp já está em execução.")
            return True

        _parar_evento.clear()
        _worker_thread = threading.Thread(
            target=_executar_worker_whatsapp,
            args=(ao_receber_mensagem or _callback_mensagem_recebida,),
            daemon=True,
            name="PlaywrightWhatsAppWorker"
        )
        _worker_thread.start()
        return True


def parar_sessao_whatsapp() -> bool:
    """Finaliza o worker e desconecta o navegador."""
    _parar_evento.set()
    _atualizar_estado(ativo=False, conectado=False, tem_qr=False)
    return True

