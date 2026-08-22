"""
app.py — Olympus-Painel backend.
Sobe em http://localhost:9001
"""
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS

load_dotenv(Path(__file__).parent / ".env")

logging.basicConfig(
    level=getattr(logging, os.environ.get("OLYMPUS_LOG_LEVEL", "INFO").upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

import db
import rotas
import rotas_analytics
import rotas_config
import rotas_conversa
import rotas_instagram
import rotas_leads

app = Flask(__name__)
CORS(app, origins=["http://localhost:9000", "http://127.0.0.1:9000"])
app.register_blueprint(rotas.bp)
app.register_blueprint(rotas_analytics.bp)
app.register_blueprint(rotas_config.bp)
app.register_blueprint(rotas_conversa.bp)
app.register_blueprint(rotas_instagram.bp)
app.register_blueprint(rotas_leads.bp)


@app.errorhandler(Exception)
def erro_generico(e):
    logger.exception("Erro nao tratado")
    return {"erro": "Erro interno do servidor"}, 500


# Prepara o banco ao iniciar
with app.app_context():
    conn = db.conectar()
    db.preparar_banco(conn)
    conn.close()
    logger.info("Banco preparado.")

if __name__ == "__main__":
    from waitress import serve
    porta = int(os.environ.get("PORT", 9001))
    logger.info("Olympus-Painel backend rodando em http://localhost:%s", porta)
    serve(app, host="127.0.0.1", port=porta, threads=4)
