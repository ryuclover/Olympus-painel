"""
rotas_disparo_whatsapp.py — Gerenciamento de Fila Inteligente e Disparo Anti-Banimento de WhatsApp.

Diretrizes de Segurança & Anti-Ban:
1. Intervalo Humano Dinâmico com Jitter (ex: 20 a 50 segundos entre envios).
2. Spintax / Variação Textual para que mensagens nunca sejam 100% idênticas.
3. Limite de lote diário para manter o número saudável.
4. Pausa automática se houver erros consecutivos.
5. Modo Seguro: Envio assistido com confirmação ou envio automático controlado.
"""

import logging
import random
import re
import threading
import time
from datetime import datetime
from flask import Blueprint, jsonify, request
import db

bp = Blueprint("rotas_disparo_whatsapp", __name__)
logger = logging.getLogger(__name__)

_lock_worker = threading.Lock()
_worker_rodando = False
_worker_pausado = False

# Spintax parser simples: converte {Olá|Oi|E aí} em uma das opções aleatoriamente
def processar_spintax(texto: str) -> str:
    if not texto:
        return ""
    padrao = re.compile(r"\{([^{}]+)\}")
    while padrao.search(texto):
        texto = padrao.sub(lambda m: random.choice(m.group(1).split("|")), texto)
    return texto


def personalizar_mensagem(template: str, lead: dict) -> str:
    msg = template
    nome = lead.get("nome") or lead.get("empresa") or "Empresa"
    primeiro_nome = nome.split()[0] if nome else "amigo(a)"
    cidade = lead.get("cidade") or ""
    categoria = lead.get("categoria") or "negócio"

    msg = msg.replace("{nome}", nome)
    msg = msg.replace("{primeiro_nome}", primeiro_nome)
    msg = msg.replace("{cidade}", cidade)
    msg = msg.replace("{categoria}", categoria)

    return processar_spintax(msg)


@bp.route("/api/whatsapp/fila", methods=["GET"])
def listar_fila():
    conn = db.conectar()
    try:
        linhas = conn.execute("""
            SELECT f.*, l.categoria, l.cidade, l.site, l.score 
            FROM fila_whatsapp f
            LEFT JOIN leads l ON f.lead_id = l.place_id
            ORDER BY 
                CASE f.status 
                    WHEN 'processando' THEN 1 
                    WHEN 'pendente' THEN 2 
                    WHEN 'falha' THEN 3 
                    ELSE 4 
                END,
                f.agendado_para ASC, f.id ASC
        """).fetchall()
        
        totais = conn.execute("""
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END) as pendentes,
                SUM(CASE WHEN status = 'enviado' THEN 1 ELSE 0 END) as enviados,
                SUM(CASE WHEN status = 'falha' THEN 1 ELSE 0 END) as falhas
            FROM fila_whatsapp
        """).fetchone()
    finally:
        conn.close()

    res = [db.linha_para_dict(l) for l in linhas]
    stats = {
        "total": totais["total"] or 0,
        "pendentes": totais["pendentes"] or 0,
        "enviados": totais["enviados"] or 0,
        "falhas": totais["falhas"] or 0,
        "worker_rodando": _worker_rodando,
        "worker_pausado": _worker_pausado
    }
    return jsonify({"itens": res, "stats": stats})


@bp.route("/api/whatsapp/fila/adicionar", methods=["POST"])
def adicionar_fila():
    dados = request.json or {}
    leads = dados.get("leads", [])
    template_mensagem = dados.get("mensagem", "Olá {primeiro_nome}, vi sua empresa no Google e gostaria de conversar.")
    delay_min = int(dados.get("delay_min_segundos", 25))
    delay_max = int(dados.get("delay_max_segundos", 60))

    if not leads:
        return jsonify({"erro": "Nenhum lead selecionado"}), 400

    conn = db.conectar()
    agora = datetime.now()
    inseridos = 0
    segundos_acumulados = 0

    try:
        for l in leads:
            tel = (l.get("telefone") or "").strip()
            # Limpa telefone
            tel_limpo = re.sub(r"\D", "", tel)
            if not tel_limpo:
                continue

            lead_id = l.get("id") or l.get("place_id") or tel_limpo
            nome = l.get("nome") or l.get("empresa") or "Empresa"
            
            # Gera mensagem personalizada com Spintax
            msg_final = personalizar_mensagem(template_mensagem, l)

            # Agenda com intervalo aleatório humano
            intervalo = random.randint(delay_min, delay_max)
            segundos_acumulados += intervalo
            data_agendada = datetime.fromtimestamp(agora.timestamp() + segundos_acumulados).isoformat(timespec="seconds")

            conn.execute("""
                INSERT INTO fila_whatsapp (
                    lead_id, nome, telefone, mensagem, status, agendado_para, criado_em, atualizado_em
                ) VALUES (?, ?, ?, ?, 'pendente', ?, datetime('now'), datetime('now'))
            """, (str(lead_id), nome, tel_limpo, msg_final, data_agendada))
            inseridos += 1

        conn.commit()
    finally:
        conn.close()

    return jsonify({
        "ok": True, 
        "inseridos": inseridos, 
        "tempo_total_estimado_minutos": round(segundos_acumulados / 60, 1)
    })


@bp.route("/api/whatsapp/fila/limpar", methods=["POST"])
def limpar_fila():
    dados = request.json or {}
    apenas_concluidos = dados.get("apenas_concluidos", False)

    conn = db.conectar()
    try:
        if apenas_concluidos:
            conn.execute("DELETE FROM fila_whatsapp WHERE status IN ('enviado', 'cancelado', 'falha')")
        else:
            conn.execute("DELETE FROM fila_whatsapp")
        conn.commit()
    finally:
        conn.close()

    return jsonify({"ok": True})


@bp.route("/api/whatsapp/fila/<int:item_id>/status", methods=["POST"])
def atualizar_status_item(item_id):
    dados = request.json or {}
    novo_status = dados.get("status")
    erro = dados.get("erro")

    if novo_status not in ("pendente", "enviado", "falha", "cancelado"):
        return jsonify({"erro": "Status inválido"}), 400

    conn = db.conectar()
    try:
        if novo_status == "enviado":
            conn.execute("""
                UPDATE fila_whatsapp 
                SET status = 'enviado', enviado_em = datetime('now'), atualizado_em = datetime('now')
                WHERE id = ?
            """, (item_id,))
            
            # Atualiza também o lead para 'contatado'
            item = conn.execute("SELECT lead_id FROM fila_whatsapp WHERE id = ?", (item_id,)).fetchone()
            if item and item["lead_id"]:
                conn.execute("UPDATE leads SET status = 'contatado', atualizado_em = datetime('now') WHERE place_id = ?", (item["lead_id"],))
        else:
            conn.execute("""
                UPDATE fila_whatsapp 
                SET status = ?, erro = ?, atualizado_em = datetime('now')
                WHERE id = ?
            """, (novo_status, erro, item_id))
        conn.commit()
    finally:
        conn.close()

    return jsonify({"ok": True})
