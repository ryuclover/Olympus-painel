# diagnostico.spec
# PyInstaller spec file para gerar o executável de diagnóstico

from pathlib import Path

# Caminho base do projeto
base_path = Path(r"C:\Users\gabri\OneDrive\Documentos\Pessoal\Prospeccao_auto\Olympus-Painel")

block_cipher = None

a = Analysis(
    ['diagnostico_cliente.py'],
    pathex=[str(base_path)],
    binaries=[],
    datas=[],
    hiddenimports=['playwright.sync_api'],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

# Incluir o Playwright e o Chromium
pz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# Incluir explicitamente os binários do Playwright
external_binaries = []
playwright_dir = base_path / '.venv' / 'Lib' / 'site-packages' / 'playwright'
if playwright_dir.exists():
    # Incluir o driver do Playwright
    driver_path = playwright_dir / 'driver'
    if driver_path.exists():
        a.datas += [(str(driver_path), 'playwright/driver')]
    
    # Incluir os navegadores (Chromium)
    browsers_dir = playwright_dir / 'driver' / 'package' / '.local-browsers'
    if browsers_dir.exists():
        a.datas += [(str(browsers_dir), 'playwright/driver/package/.local-browsers')]
        # Marcar os executáveis do Chromium para serem incluídos como binários
        for chromium_dir in browsers_dir.glob('chromium-*'):
            chrome_exe = chromium_dir / 'chrome-win64' / 'chrome.exe'
            if chrome_exe.exists():
                external_binaries.append((str(chrome_exe), '.'))

a.binaries = external_binaries

ex = EXE(
    pz,
    a,
    [],
    exclude_binaries=True,
    name='Olympus-Diagnostico',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    icon=None,
)
