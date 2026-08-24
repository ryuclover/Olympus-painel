# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec para o backend do Olympus Painel
# Gera: backend.exe (Windows, single file)

import sys
from pathlib import Path

block_cipher = None

# Coleta todos os módulos hidden imports que o Flask e dependências precisam
hidden_imports = [
    # Flask e extensões
    'flask',
    'flask.templating',
    'flask_cors',
    'jinja2',
    'jinja2.ext',
    'werkzeug',
    'werkzeug.debug',
    'werkzeug.routing',
    'werkzeug.serving',
    # Servidor WSGI
    'waitress',
    'waitress.task',
    'waitress.channel',
    'waitress.server',
    # Utilitários
    'requests',
    'requests.adapters',
    'fpdf',
    'dotenv',
    'sqlite3',
    'json',
    'logging',
    'pathlib',
    'datetime',
    # Playwright (async e sync)
    'playwright',
    'playwright.sync_api',
    'playwright.async_api',
    'playwright._impl._driver',
    'playwright._impl._transport',
    'asyncio',
    # Módulos internos (ajustar conforme necessário)
    'rotas',
    'rotas_analytics',
    'rotas_config',
    'rotas_conversa',
    'rotas_instagram',
    'rotas_leads',
    'rotas_dashboard',
    'rotas_templates',
    'rotas_contratos',
    'db',
    'processar',
    'telefone_util',
    'buscar',
    'scraper_google_maps',
    'scraper_google_maps.core',
    'scraper_google_maps.extractor',
]

a = Analysis(
    ['app.py'],
    pathex=[str(Path('.').resolve())],
    binaries=[],
    datas=[
        (str(Path(sys.prefix) / 'Lib' / 'site-packages' / 'playwright' / 'driver' / 'package' / '.local-browsers'), 'playwright-browsers'),
        ('scraper_google_maps', 'scraper_google_maps'),
        # Inclui o arquivo .env se existir
        ('.env', '.') if Path('.env').exists() else ('', ''),
    ],
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'numpy',
        'pandas',
        'PIL',
        'cv2',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

# Filtra datas vazias geradas acima
a.datas = [(dest, src, typ) for dest, src, typ in a.datas if src]

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,   # console=False para ocultar janela no produto final
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
