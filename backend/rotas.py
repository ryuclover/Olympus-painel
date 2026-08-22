"""
rotas.py — Endpoints REST do Olympus-Painel.
"""
import logging

from flask import Blueprint, jsonify, request

import buscar
import cep as cep_mod
import db
import processar

bp = Blueprint("api", __name__)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Busca
# ---------------------------------------------------------------------------
@bp.post("/api/buscar")
def disparar_busca():
    corpo = request.get_json(force=True, silent=True) or {}
    categoria = (corpo.get("categoria") or "").strip()
    localizacao_raw = (corpo.get("localizacao") or "").strip()
    raio_km = int(corpo.get("raio_km") or 20)

    if not categoria:
        categoria = "estabelecimentos comerciais"
    if not localizacao_raw:
        return jsonify({"erro": "Campo 'localizacao' e obrigatorio"}), 400

    # Resolve CEP → cidade/estado
    try:
        info_loc = cep_mod.resolver_localizacao(localizacao_raw)
    except Exception as exc:
        return jsonify({"erro": str(exc)}), 400

    try:
        buscar.iniciar_busca(
            categoria=categoria,
            localizacao=info_loc["localizacao"],
            cidade=info_loc["cidade"],
            raio_km=raio_km,
        )
    except ValueError as exc:
        return jsonify({"erro": str(exc)}), 409

    return jsonify({"ok": True, "localizacao_resolvida": info_loc["localizacao"]})


@bp.get("/api/buscar/status")
def status_busca():
    return jsonify(buscar.estado_busca)





# ---------------------------------------------------------------------------
# Configuracoes / info
# ---------------------------------------------------------------------------
@bp.get("/api/info")
def info():
    import buscar as b
    exe = b._caminho_scraper()
    import os
    return jsonify({
        "scraper_disponivel": exe is not None,
        "scraper_path": str(exe) if exe else None,
        "places_api_configurada": bool(os.environ.get("GOOGLE_PLACES_API_KEY")),
    })
