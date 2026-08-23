"""
rotas_fechamento.py — Gerencia detalhes de negócios fechados:
  - Atualizar valor_fechado, data_fechamento, notas
  - Upload/listagem/exclusão de contrato (PDF)
  - Upload/listagem/exclusão de prints da conversa
"""

import logging
import os
import uuid
from datetime import datetime
from pathlib import Path

from flask import Blueprint, jsonify, request

import db

logger = logging.getLogger(__name__)

bp = Blueprint("fechamento", __name__)

UPLOAD_FOLDER = Path(__file__).parent / "uploads"
UPLOAD_FOLDER.mkdir(exist_ok=True)

EXTENSOES_CONTRATO = {".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg"}
EXTENSOES_IMAGEM = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}
TAMANHO_MAX_MB = 20


def _salvar_arquivo(file_storage, subfolder: str) -> str:
    """Salva o arquivo em uploads/<subfolder>/ e retorna o nome relativo."""
    pasta = UPLOAD_FOLDER / subfolder
    pasta.mkdir(parents=True, exist_ok=True)
    ext = Path(file_storage.filename).suffix.lower()
    nome_unico = f"{uuid.uuid4().hex}{ext}"
    file_storage.save(str(pasta / nome_unico))
    return f"{subfolder}/{nome_unico}"


def _arquivos_com_url(rows):
    result = []
    for r in rows:
        d = dict(r)
        d["url"] = f"/uploads/{d['nome_arquivo']}"
        d.setdefault("nome_original", d["nome_arquivo"])
        result.append(d)
    return result


# ─── DETALHES DO FECHAMENTO ───────────────────────────────────────────────────

@bp.route("/api/leads/<place_id>/fechamento", methods=["GET", "POST"])
def fechamento(place_id):
    if request.method == "GET":
        return _obter_fechamento(place_id)
    return _salvar_fechamento(place_id)


def _obter_fechamento(place_id):
    conn = db.conectar()
    try:
        lead = conn.execute(
            "SELECT valor_fechado, data_fechamento, notas_fechamento FROM leads WHERE place_id = ?",
            (place_id,)
        ).fetchone()
        if not lead:
            return jsonify({"erro": "lead não encontrado"}), 404

        lead_dict = dict(lead)

        arquivos = conn.execute(
            "SELECT id, tipo, nome_arquivo, nome_original, criado_em "
            "FROM arquivos_lead WHERE place_id = ? ORDER BY criado_em DESC",
            (place_id,)
        ).fetchall()
        arquivos_list = _arquivos_com_url(arquivos)
    finally:
        conn.close()

    return jsonify({
        "valor_fechado": lead_dict.get("valor_fechado") or 0,
        "data_fechamento": lead_dict.get("data_fechamento"),
        "notas_fechamento": lead_dict.get("notas_fechamento"),
        "arquivos": arquivos_list,
    })


def _salvar_fechamento(place_id):
    dados = request.get_json() or {}
    agora = datetime.now().isoformat(timespec="seconds")

    atualizacoes = {}
    if "valor_fechado" in dados:
        try:
            atualizacoes["valor_fechado"] = float(dados["valor_fechado"])
        except (TypeError, ValueError):
            return jsonify({"erro": "valor_fechado inválido"}), 400

    if "data_fechamento" in dados:
        atualizacoes["data_fechamento"] = dados["data_fechamento"] or None

    if "notas_fechamento" in dados:
        txt = dados["notas_fechamento"]
        atualizacoes["notas_fechamento"] = str(txt)[:2000] if txt else None

    if not atualizacoes:
        return jsonify({"erro": "nenhum campo enviado"}), 400

    atualizacoes["atualizado_em"] = agora

    set_clause = ", ".join(f"{k} = ?" for k in atualizacoes)
    valores = list(atualizacoes.values()) + [place_id]

    conn = db.conectar()
    try:
        rowcount = conn.execute(
            f"UPDATE leads SET {set_clause} WHERE place_id = ?", valores
        ).rowcount
        conn.commit()
    finally:
        conn.close()

    if rowcount == 0:
        return jsonify({"erro": "lead não encontrado"}), 404

    logger.info("Fechamento salvo para %s: %s", place_id, atualizacoes)
    return jsonify({"ok": True})


# ─── UPLOAD DE ARQUIVOS ───────────────────────────────────────────────────────

@bp.route("/api/leads/<place_id>/arquivos", methods=["GET", "POST"])
def arquivos(place_id):
    if request.method == "GET":
        return _listar_arquivos(place_id)
    return _upload_arquivo(place_id)


def _listar_arquivos(place_id):
    tipo = request.args.get("tipo", "").strip()
    conn = db.conectar()
    try:
        if tipo:
            rows = conn.execute(
                "SELECT id, tipo, nome_arquivo, nome_original, criado_em "
                "FROM arquivos_lead WHERE place_id = ? AND tipo = ? ORDER BY criado_em DESC",
                (place_id, tipo),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, tipo, nome_arquivo, nome_original, criado_em "
                "FROM arquivos_lead WHERE place_id = ? ORDER BY criado_em DESC",
                (place_id,),
            ).fetchall()
    finally:
        conn.close()

    return jsonify({"arquivos": _arquivos_com_url(rows)})


def _upload_arquivo(place_id):
    if "arquivo" not in request.files:
        return jsonify({"erro": "campo 'arquivo' não enviado"}), 400

    file = request.files["arquivo"]
    tipo = (request.form.get("tipo") or "").strip()
    if tipo not in ("contrato", "print"):
        return jsonify({"erro": "tipo deve ser 'contrato' ou 'print'"}), 400

    if not file.filename:
        return jsonify({"erro": "arquivo sem nome"}), 400

    ext = Path(file.filename).suffix.lower()
    if tipo == "contrato" and ext not in EXTENSOES_CONTRATO:
        return jsonify({"erro": f"extensão não permitida para contrato: {ext}"}), 400
    if tipo == "print" and ext not in EXTENSOES_IMAGEM:
        return jsonify({"erro": f"extensão não permitida para print: {ext}"}), 400

    # Checar tamanho
    file.seek(0, os.SEEK_END)
    tamanho = file.tell()
    file.seek(0)
    if tamanho > TAMANHO_MAX_MB * 1024 * 1024:
        return jsonify({"erro": f"arquivo muito grande (máx {TAMANHO_MAX_MB}MB)"}), 413

    nome_original = file.filename
    caminho_relativo = _salvar_arquivo(file, subfolder=place_id)
    agora = datetime.now().isoformat(timespec="seconds")

    conn = db.conectar()
    try:
        cursor = conn.execute(
            "INSERT INTO arquivos_lead (place_id, tipo, nome_arquivo, nome_original, criado_em) "
            "VALUES (?, ?, ?, ?, ?)",
            (place_id, tipo, caminho_relativo, nome_original, agora),
        )
        conn.commit()
        arquivo_id = cursor.lastrowid
    finally:
        conn.close()

    logger.info("Arquivo %s enviado para lead %s (%s)", nome_original, place_id, tipo)
    return jsonify({
        "ok": True,
        "id": arquivo_id,
        "tipo": tipo,
        "nome_arquivo": caminho_relativo,
        "nome_original": nome_original,
        "url": f"/uploads/{caminho_relativo}",
        "criado_em": agora,
    })


@bp.route("/api/leads/<place_id>/arquivos/<int:arquivo_id>", methods=["DELETE"])
def deletar_arquivo(place_id, arquivo_id):
    conn = db.conectar()
    try:
        row = conn.execute(
            "SELECT nome_arquivo FROM arquivos_lead WHERE id = ? AND place_id = ?",
            (arquivo_id, place_id),
        ).fetchone()
        if not row:
            return jsonify({"erro": "arquivo não encontrado"}), 404

        caminho = UPLOAD_FOLDER / row["nome_arquivo"]
        conn.execute("DELETE FROM arquivos_lead WHERE id = ?", (arquivo_id,))
        conn.commit()
    finally:
        conn.close()

    try:
        caminho.unlink(missing_ok=True)
    except Exception:
        pass

    return jsonify({"ok": True})
