"""
db.py — Conexao SQLite e schema do Olympus-Painel.
"""
import logging
import os
import sqlite3
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

CAMINHO_BANCO = Path(__file__).parent / "olympus.db"


def conectar() -> sqlite3.Connection:
    conn = sqlite3.connect(CAMINHO_BANCO, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def linha_para_dict(linha):
    return dict(linha)


def preparar_banco(conn: sqlite3.Connection):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS leads (
            place_id        TEXT PRIMARY KEY,
            nome            TEXT NOT NULL,
            categoria       TEXT,
            avaliacao       REAL DEFAULT 0,
            total_avaliacoes INTEGER DEFAULT 0,
            telefone        TEXT,
            endereco        TEXT,
            cidade          TEXT,
            estado          TEXT,
            site            TEXT,
            site_status     TEXT DEFAULT 'sem_site',
            lat             REAL,
            lng             REAL,
            score           INTEGER DEFAULT 0,
            status          TEXT DEFAULT 'novo',
            tags            TEXT DEFAULT '',
            observacao      TEXT DEFAULT '',
            criado_em       TEXT DEFAULT (datetime('now')),
            atualizado_em   TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS buscas (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            categoria   TEXT,
            localizacao TEXT,
            raio_km     INTEGER,
            total_leads INTEGER DEFAULT 0,
            criado_em   TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS configuracoes (
            chave         TEXT PRIMARY KEY,
            valor         TEXT,
            atualizado_em TEXT
        );
    """)
    conn.commit()

CHAVES_CONFIG_VALIDAS = {
    "gemini": "GEMINI_API_KEY",
    "groq": "GROQ_API_KEY",
    "nvidia": "NVIDIA_API_KEY",
    "pagespeed": "PAGESPEED_API_KEY",
    "places": "PLACES_API_KEY",
}
CHAVES_SECRETAS = set(CHAVES_CONFIG_VALIDAS)
_SERVICO_KEYRING = "ProspectOS"

def _keyring_obter(chave):
    try:
        import keyring
        return keyring.get_password(_SERVICO_KEYRING, chave)
    except Exception:
        return None

def _keyring_salvar(chave, valor):
    try:
        import keyring
        keyring.set_password(_SERVICO_KEYRING, chave, valor)
        return True
    except Exception:
        return False

def _keyring_apagar(chave):
    try:
        import keyring
        keyring.delete_password(_SERVICO_KEYRING, chave)
    except Exception:
        pass

def obter_config(chave, default=None):
    if chave in CHAVES_SECRETAS:
        valor = _keyring_obter(chave)
        if valor: return valor

    conn = conectar()
    try:
        linha = conn.execute("SELECT valor FROM configuracoes WHERE chave = ?", (chave,)).fetchone()
    except Exception:
        linha = None
    finally:
        conn.close()

    if linha and linha["valor"]: return linha["valor"]
    chave_env = CHAVES_CONFIG_VALIDAS.get(chave, chave)
    return os.environ.get(chave_env, default)

def salvar_config(chave, valor):
    if chave in CHAVES_SECRETAS and _keyring_salvar(chave, valor):
        return

    conn = conectar()
    try:
        conn.execute(
            """
            INSERT INTO configuracoes (chave, valor, atualizado_em) VALUES (?, ?, ?)
            ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em
            """,
            (chave, valor, datetime.now().isoformat(timespec="seconds")),
        )
        conn.commit()
    finally:
        conn.close()
