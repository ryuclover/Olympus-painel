import json
import logging
import sqlite3
from flask import Blueprint, request, jsonify
from db import conectar, linha_para_dict
from datetime import datetime

logger = logging.getLogger(__name__)

bp = Blueprint('contratos', __name__)

@bp.route('/api/contratos', methods=['GET'])
def listar_contratos():
    try:
        with conectar() as conn:
            cursor = conn.execute("SELECT id, cliente_nome, projeto_nome, valor_total, status, criado_em, atualizado_em FROM contratos ORDER BY criado_em DESC")
            contratos = [linha_para_dict(linha) for linha in cursor.fetchall()]
        return jsonify({"contratos": contratos})
    except Exception as e:
        logger.error(f"Erro ao listar contratos: {e}")
        return jsonify({"erro": str(e)}), 500

@bp.route('/api/contratos/<int:id>', methods=['GET'])
def buscar_contrato(id):
    try:
        with conectar() as conn:
            cursor = conn.execute("SELECT * FROM contratos WHERE id = ?", (id,))
            linha = cursor.fetchone()
            if not linha:
                return jsonify({"erro": "Contrato nao encontrado"}), 404
            
            contrato = linha_para_dict(linha)
            if contrato.get('dados_json'):
                try:
                    contrato['dados'] = json.loads(contrato['dados_json'])
                except Exception:
                    contrato['dados'] = {}
            else:
                contrato['dados'] = {}
                
            return jsonify(contrato)
    except Exception as e:
        logger.error(f"Erro ao buscar contrato {id}: {e}")
        return jsonify({"erro": str(e)}), 500

@bp.route('/api/contratos', methods=['POST'])
def criar_contrato():
    dados = request.json
    if not dados:
        return jsonify({"erro": "Nenhum dado enviado"}), 400
    
    try:
        cliente_nome = dados.get('cliente_nome', '')
        projeto_nome = dados.get('projeto_nome', '')
        valor_total = float(dados.get('valor_total', 0.0))
        status = dados.get('status', 'rascunho')
        dados_completos = dados.get('dados', {})
        dados_json = json.dumps(dados_completos)

        with conectar() as conn:
            cursor = conn.execute('''
                INSERT INTO contratos (cliente_nome, projeto_nome, valor_total, status, dados_json, criado_em, atualizado_em)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (cliente_nome, projeto_nome, valor_total, status, dados_json, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
            novo_id = cursor.lastrowid
            conn.commit()
            
        return jsonify({"mensagem": "Contrato salvo com sucesso", "id": novo_id}), 201
    except Exception as e:
        logger.error(f"Erro ao criar contrato: {e}")
        return jsonify({"erro": str(e)}), 500

@bp.route('/api/contratos/<int:id>', methods=['PUT'])
def atualizar_contrato(id):
    dados = request.json
    if not dados:
        return jsonify({"erro": "Nenhum dado enviado"}), 400
    
    try:
        cliente_nome = dados.get('cliente_nome', '')
        projeto_nome = dados.get('projeto_nome', '')
        valor_total = float(dados.get('valor_total', 0.0))
        status = dados.get('status', 'rascunho')
        dados_completos = dados.get('dados', {})
        dados_json = json.dumps(dados_completos)

        with conectar() as conn:
            conn.execute('''
                UPDATE contratos 
                SET cliente_nome = ?, projeto_nome = ?, valor_total = ?, status = ?, dados_json = ?, atualizado_em = ?
                WHERE id = ?
            ''', (cliente_nome, projeto_nome, valor_total, status, dados_json, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), id))
            conn.commit()
            
        return jsonify({"mensagem": "Contrato atualizado com sucesso", "id": id})
    except Exception as e:
        logger.error(f"Erro ao atualizar contrato {id}: {e}")
        return jsonify({"erro": str(e)}), 500

@bp.route('/api/contratos/<int:id>', methods=['DELETE'])
def excluir_contrato(id):
    try:
        with conectar() as conn:
            conn.execute("DELETE FROM contratos WHERE id = ?", (id,))
            conn.commit()
        return jsonify({"mensagem": "Contrato excluido com sucesso"}), 200
    except Exception as e:
        logger.error(f"Erro ao excluir contrato {id}: {e}")
        return jsonify({"erro": str(e)}), 500
