"""
rotas_whatsapp_bot.py — Endpoints para o controle do WhatsApp Autônomo e notificações.
"""
import logging
from flask import Blueprint, jsonify, request
import whatsapp_bot
import db

logger = logging.getLogger(__name__)
bp = Blueprint("whatsapp_bot", __name__)


@bp.route("/api/whatsapp/status", methods=["GET"])
def status_whatsapp():
    estado = whatsapp_bot.obter_estado()
    estado["whatsapp_admin_notificacao"] = db.obter_config("whatsapp_admin_notificacao") or ""

    conn = db.conectar()
    try:
        linha = conn.execute("SELECT COUNT(*) as total FROM fila_whatsapp WHERE status = 'pendente'").fetchone()
        estado["total_fila_pendente"] = linha["total"] if linha else 0
    finally:
        conn.close()

    return jsonify(estado)


@bp.route("/api/whatsapp/debug-inspect", methods=["GET"])
def debug_inspect():
    import whatsapp_playwright
    def _in(p):
        return p.evaluate(r"""
        () => {
            const side = document.querySelector('#pane-side');
            const main = document.querySelector('#main');
            const rows = side ? Array.from(side.querySelectorAll('div[role="listitem"], div[role="row"], div[data-testid="cell-frame-container"]')) : [];
            const rowData = rows.slice(0, 10).map(r => ({
                text: (r.innerText || '').slice(0, 100),
                hasBadge: !!r.querySelector('[aria-label*="não lid"], [aria-label*="unread"], [data-testid*="unread"], [data-testid="icon-unread-count"]'),
                badgeText: r.querySelector('[aria-label*="não lid"], [aria-label*="unread"], [data-testid*="unread"], [data-testid="icon-unread-count"]')?.innerText || '',
                tag: r.tagName,
                className: r.className
            }));
            const mainHeader = main ? (main.querySelector('header')?.innerText || '') : 'SEM MAIN';
            const searchBox = !!document.querySelector('#side div[contenteditable="true"], [data-testid="chat-list-search"]');
            return {
                mainAberto: !!main,
                mainHeader: mainHeader.slice(0, 150),
                totalRows: rows.length,
                rows: rowData,
                searchBox: searchBox
            };
        }
        """)
    try:
        res = whatsapp_playwright.executar_no_navegador(_in, timeout=10)
        return jsonify({"ok": True, "res": res})
    except Exception as e:
        return jsonify({"ok": False, "erro": str(e)})


@bp.route("/api/whatsapp/iniciar", methods=["POST"])
def iniciar_whatsapp():
    ok = whatsapp_bot.simular_ou_iniciar_bot()
    return jsonify({"ok": ok, "estado": whatsapp_bot.obter_estado()})


@bp.route("/api/whatsapp/parar", methods=["POST"])
def parar_whatsapp():
    ok = whatsapp_bot.parar_bot()
    return jsonify({"ok": ok, "estado": whatsapp_bot.obter_estado()})


@bp.route("/api/whatsapp/webhook-mensagem", methods=["POST"])
def webhook_mensagem():
    dados = request.json or {}
    telefone = str(dados.get("telefone", "")).strip()
    texto = str(dados.get("texto", "")).strip()

    if not telefone or not texto:
        return jsonify({"erro": "Informe telefone e texto da mensagem"}), 400

    whatsapp_bot.receber_mensagem_webhook(telefone, texto)
    return jsonify({"ok": True, "mensagem": f"Mensagem recebida e colocada no buffer de debounce (35s) para {telefone}"})


@bp.route("/api/whatsapp/testar-alerta-admin", methods=["POST"])
def testar_alerta_admin():
    dados = request.json or {}
    telefone = str(dados.get("telefone") or db.obter_config("whatsapp_admin_notificacao") or "").strip()

    if not telefone:
        return jsonify({"erro": "Configure o seu número de WhatsApp de administrador antes de testar"}), 400

    ok = whatsapp_bot.notificar_admin_reuniao(
        lead_nome="Lead Exemplo (Dr. Silva)",
        data_reuniao="2026-10-23",
        horario_reuniao="14:00",
        telefone_cliente="11988887777",
        categoria="Clínica Odontológica",
        cidade="São Paulo"
    )
    return jsonify({
        "ok": ok,
        "mensagem": f"Alerta teste enfileirado para o WhatsApp: {telefone}!"
    })


@bp.route("/api/whatsapp/toggle-envio-automatico", methods=["POST"])
def toggle_envio_automatico():
    dados = request.json or {}
    ativo = bool(dados.get("ativo", False))
    db.salvar_config("whatsapp_envio_automatico", "1" if ativo else "0")
    return jsonify({
        "ok": True,
        "envio_automatico": ativo,
        "mensagem": "Envio automático da fila ATIVADO" if ativo else "Envio automático da fila PAUSADO por segurança."
    })


@bp.route("/api/whatsapp/limpar-fila", methods=["POST"])
def limpar_fila_whatsapp():
    conn = db.conectar()
    try:
        cur = conn.execute(
            """
            UPDATE fila_whatsapp
            SET status = 'cancelado', atualizado_em = datetime('now')
            WHERE status = 'pendente'
            """
        )
        total = cur.rowcount
        conn.commit()
        return jsonify({
            "ok": True,
            "canceladas": total,
            "mensagem": f"{total} mensagem(ns) pendente(s) foram canceladas com segurança."
        })
    finally:
        conn.close()


@bp.route("/api/whatsapp/enviar-mensagem-direta", methods=["POST"])
def enviar_mensagem_direta():
    dados = request.json or {}
    telefone = str(dados.get("telefone") or db.obter_config("whatsapp_admin_notificacao") or "").strip()
    texto = str(dados.get("texto", "")).strip()

    if not telefone or not texto:
        return jsonify({"erro": "Informe telefone e mensagem para envio direto"}), 400

    ok = whatsapp_bot.enfileirar_mensagem(telefone, texto)
    return jsonify({
        "ok": ok,
        "telefone": telefone,
        "mensagem": "Mensagem adicionada com sucesso para envio de teste ao seu WhatsApp."
    })


@bp.route("/api/whatsapp/simular-interacao", methods=["POST"])
def simular_interacao():
    dados = request.json or {}
    telefone = str(dados.get("telefone") or db.obter_config("whatsapp_admin_notificacao") or "21983811968").strip()
    texto = str(dados.get("texto", "")).strip()
    historico = dados.get("historico") or []
    enviar_whatsapp = bool(dados.get("enviar_whatsapp", False))

    if not texto and not historico:
        return jsonify({"erro": "Informe o texto ou histórico da conversa com a IA"}), 400

    # Converte histórico no formato esperado pelo analisador da IA se fornecido
    historico_formatado = []
    if historico:
        for item in historico:
            historico_formatado.append({
                "autor": "lead" if item.get("autor") in ("lead", "usuario", "user") else "bot",
                "texto": item.get("texto", ""),
                "enviada_em": item.get("enviada_em") or ""
            })
    elif texto:
        historico_formatado = [{"autor": "lead", "texto": texto}]

    # Executa a IA de forma segura (enfileirar e salvar_reuniao_real = enviar_whatsapp)
    resultado = whatsapp_bot.processar_resposta_lead_com_ia(
        telefone=telefone,
        historico_completo=historico_formatado,
        enfileirar=enviar_whatsapp,
        salvar_reuniao_real=enviar_whatsapp
    )

    return jsonify({
        "ok": resultado.get("ok", False),
        "telefone_destino": telefone,
        "mensagem_lead": texto or (historico[-1]["texto"] if historico else ""),
        "resposta_ia": resultado.get("resposta_sugerida", ""),
        "analise": resultado.get("analise", {}),
        "reuniao_detectada": resultado.get("reuniao_detectada", {}),
        "provedor": resultado.get("provedor", ""),
        "enviado_para_fila": enviar_whatsapp
    })


@bp.route("/api/whatsapp/gerar-abordagem-alvo", methods=["POST"])
def gerar_abordagem_alvo():
    dados = request.json or {}
    telefone = str(dados.get("telefone", "")).strip()
    nome = str(dados.get("nome", "")).strip()
    categoria = str(dados.get("categoria", "")).strip()

    if not telefone:
        return jsonify({"erro": "Informe o telefone alvo para gerar a abordagem"}), 400

    resultado = whatsapp_bot.gerar_abordagem_inicial(telefone, nome, categoria)
    return jsonify(resultado)


@bp.route("/api/whatsapp/iniciar-conversa-alvo", methods=["POST"])
def iniciar_conversa_alvo_endpoint():
    dados = request.json or {}
    telefone = str(dados.get("telefone", "")).strip()
    nome = str(dados.get("nome", "")).strip()
    categoria = str(dados.get("categoria", "")).strip()
    mensagem = str(dados.get("mensagem", "")).strip()

    if not telefone or not mensagem:
        return jsonify({"erro": "Informe o telefone alvo e a mensagem inicial"}), 400

    resultado = whatsapp_bot.iniciar_conversa_alvo(telefone, mensagem, nome, categoria)
    return jsonify(resultado)


@bp.route("/api/whatsapp/debug-dom", methods=["GET"])
def debug_dom():
    import whatsapp_playwright
    def _inspect(pagina):
        return pagina.evaluate(r"""
        () => {
            const main = document.querySelector('#main');
            const side = document.querySelector('#pane-side');
            const rows = side ? Array.from(side.querySelectorAll('div[role="listitem"], div[role="row"], div[tabindex="-1"], div[data-testid="cell-frame-container"]')).slice(0, 10).map(r => {
                const titleEl = r.querySelector('span[title], [dir="auto"]');
                const badgeEl = r.querySelector('[aria-label*="não lid"], [aria-label*="unread"], [data-testid*="unread"], [data-testid="icon-unread-count"]');
                return {
                    text: (r.innerText || '').slice(0, 80),
                    title: titleEl ? (titleEl.getAttribute('title') || titleEl.innerText) : null,
                    badge: badgeEl ? (badgeEl.getAttribute('aria-label') || badgeEl.innerText || true) : null
                };
            }) : [];

            const msgs = main ? Array.from(main.querySelectorAll('div[data-testid="msg-container"]')).slice(-4).map(c => {
                const copyable = c.querySelector('.copyable-text');
                const row = c.closest('[role="row"]') || c;
                const withId = c.closest('[data-id]') || c.querySelector('[data-id]') || c;
                const rect = c.getBoundingClientRect();
                const mainRect = main.getBoundingClientRect();
                return {
                    text: (copyable ? copyable.innerText : c.innerText || '').trim().slice(0, 50),
                    dataId: withId.getAttribute('data-id'),
                    left: Math.round(rect.left - mainRect.left),
                    right: Math.round(mainRect.right - rect.right),
                    is_tail_out: !!c.querySelector('span[data-icon*="tail-out"]'),
                    is_tail_in: !!c.querySelector('span[data-icon*="tail-in"]')
                };
            }) : [];

            return {
                tem_main: !!main,
                main_header: main ? (main.querySelector('header span[title], header span[dir="auto"], header')?.innerText || '') : '',
                msgs: msgs,
                side_rows: rows,
                url: window.location.href
            };
        }
        """)

    try:
        ir_tel = request.args.get("ir")
        if ir_tel:
            def _nav_action(pagina):
                url = f"https://web.whatsapp.com/send?phone={ir_tel}"
                pagina.goto(url, wait_until="domcontentloaded", timeout=20000)
                import time
                time.sleep(3)
                return {"url": pagina.url}
            res_nav = whatsapp_playwright.executar_no_navegador(_nav_action, timeout=30)
            return jsonify({"ok": True, "nav": res_nav})

        alvo = request.args.get("clicar")
        if alvo:
            def _click_action(pagina):
                locator = pagina.locator('#pane-side div[role="listitem"], #pane-side div[role="row"], #pane-side [tabindex="-1"]').filter(has_text=alvo)
                if locator.count() > 0:
                    locator.first.click(timeout=3000, force=True)
                    import time
                    time.sleep(2)
                    return {"clicou": True, "count": locator.count()}
                return {"clicou": False, "count": 0}
            res_click = whatsapp_playwright.executar_no_navegador(_click_action)
            return jsonify({"ok": True, "click": res_click})

        res = whatsapp_playwright.executar_no_navegador(_inspect)
        return jsonify({"ok": True, "dom": res})
    except Exception as e:
        return jsonify({"ok": False, "erro": str(e)}), 500


@bp.route("/api/whatsapp/reiniciar-chat", methods=["POST"])
def endpoint_reiniciar_chat():
    dados = request.json or {}
    telefone = str(dados.get("telefone") or db.obter_config("whatsapp_admin_notificacao") or "21983811968").strip()
    reenviar = bool(dados.get("reenviar", True))
    nome = str(dados.get("nome", "Gabriel")).strip()
    categoria = str(dados.get("categoria", "Clínica Médica")).strip()

    resultado = whatsapp_bot.reiniciar_chat_lead(
        telefone=telefone,
        reenviar_abordagem=reenviar,
        nome=nome,
        categoria=categoria
    )
    return jsonify(resultado)



