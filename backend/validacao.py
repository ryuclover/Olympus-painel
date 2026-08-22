from flask import jsonify

def validar_ids_bulk(lista_ids, nome_campo="id"):
    if not lista_ids:
        return None, (jsonify({"erro": f"'{nome_campo}' não fornecido ou vazio"}), 400)
    if not isinstance(lista_ids, list):
        return None, (jsonify({"erro": f"'{nome_campo}' deve ser uma lista"}), 400)
    return lista_ids, None
