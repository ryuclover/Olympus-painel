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
    busca_rapida = bool(corpo.get("busca_rapida", True))
    busca_super_rapida = bool(corpo.get("busca_super_rapida", False))
    ignorar_fixos = bool(corpo.get("ignorar_fixos", False))

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
            busca_rapida=busca_rapida,
            busca_super_rapida=busca_super_rapida,
            ignorar_fixos=ignorar_fixos,
        )
    except ValueError as exc:
        return jsonify({"erro": str(exc)}), 409


    return jsonify({"ok": True, "localizacao_resolvida": info_loc["localizacao"]})


@bp.get("/api/buscar/status")
def status_busca():
    return jsonify(buscar.estado_busca)





@bp.get("/api/info")
def info():
    import os
    from pathlib import Path
    scraper_path = Path(__file__).parent / "scraper_google_maps" / "cli.py"
    return jsonify({
        "scraper_disponivel": scraper_path.exists(),
        "scraper_path": str(scraper_path) if scraper_path.exists() else None,
        "places_api_configurada": bool(os.environ.get("GOOGLE_PLACES_API_KEY")),
    })
