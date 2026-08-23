import logging
from datetime import datetime
from flask import Blueprint, jsonify, request
import db

bp = Blueprint("rotas_templates", __name__)
logger = logging.getLogger(__name__)

@bp.route("/api/templates", methods=["GET"])
def listar_templates():
    conexao = db.conectar()
    try:
        linhas = conexao.execute("SELECT * FROM mensagens_template ORDER BY criado_em DESC").fetchall()
    finally:
        conexao.close()
    
    return jsonify([db.linha_para_dict(l) for l in linhas])

@bp.route("/api/templates", methods=["POST"])
def criar_template():
    dados = request.json or {}
    titulo = dados.get("titulo", "").strip()
    mensagem = dados.get("mensagem", "").strip()
    
    if not titulo or not mensagem:
        return jsonify({"erro": "Título e mensagem são obrigatórios"}), 400
        
    agora = datetime.now().isoformat(timespec="seconds")
    
    conexao = db.conectar()
    try:
        cur = conexao.execute(
            "INSERT INTO mensagens_template (titulo, mensagem, is_padrao, criado_em, atualizado_em) VALUES (?, ?, 0, ?, ?)",
            (titulo, mensagem, agora, agora)
        )
        template_id = cur.lastrowid
        conexao.commit()
    finally:
        conexao.close()
        
    return jsonify({"id": template_id, "ok": True})

@bp.route("/api/templates/<int:template_id>", methods=["PUT"])
def atualizar_template(template_id):
    dados = request.json or {}
    titulo = dados.get("titulo", "").strip()
    mensagem = dados.get("mensagem", "").strip()
    
    if not titulo or not mensagem:
        return jsonify({"erro": "Título e mensagem são obrigatórios"}), 400
        
    agora = datetime.now().isoformat(timespec="seconds")
    
    conexao = db.conectar()
    try:
        conexao.execute(
            "UPDATE mensagens_template SET titulo = ?, mensagem = ?, atualizado_em = ? WHERE id = ?",
            (titulo, mensagem, agora, template_id)
        )
        conexao.commit()
    finally:
        conexao.close()
        
    return jsonify({"ok": True})

@bp.route("/api/templates/<int:template_id>", methods=["DELETE"])
def deletar_template(template_id):
    conexao = db.conectar()
    try:
        conexao.execute("DELETE FROM mensagens_template WHERE id = ?", (template_id,))
        conexao.commit()
    finally:
        conexao.close()
        
    return jsonify({"ok": True})

@bp.route("/api/templates/<int:template_id>/padrao", methods=["POST"])
def set_padrao(template_id):
    agora = datetime.now().isoformat(timespec="seconds")
    conexao = db.conectar()
    try:
        # Tira o padrão de todos
        conexao.execute("UPDATE mensagens_template SET is_padrao = 0, atualizado_em = ?", (agora,))
        # Define o padrão para o específico
        conexao.execute("UPDATE mensagens_template SET is_padrao = 1, atualizado_em = ? WHERE id = ?", (agora, template_id))
        conexao.commit()
    finally:
        conexao.close()
        
    return jsonify({"ok": True})
