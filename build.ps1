# ============================================================
#  build.ps1 — Script de build do Olympus Painel
#  Gera o instalador Windows: OlympusPainel-Setup-vX.X.X.exe
#  
#  Como usar:
#    1. Abra o PowerShell na pasta raiz do projeto
#    2. Execute: .\build.ps1
#    3. Aguarde. O instalador será gerado em: release/<versão>/
# ============================================================

param(
    [switch]$SkipBackend,     # Pula a compilação do backend Python
    [switch]$SkipFrontend,    # Pula a compilação do frontend React
    [switch]$Verbose          # Mostra saída detalhada
)

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.ForegroundColor = "White"

function Write-Step($msg) {
    Write-Host ""
    Write-Host "=======================================" -ForegroundColor Cyan
    Write-Host " $msg" -ForegroundColor Cyan
    Write-Host "=======================================" -ForegroundColor Cyan
}

function Write-OK($msg) {
    Write-Host "[OK] $msg" -ForegroundColor Green
}

function Write-Fail($msg) {
    Write-Host "[ERRO] $msg" -ForegroundColor Red
}

# ── Lê a versão do package.json ──────────────────────────────────────────────
$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$version = $packageJson.version
Write-Host ""
Write-Host "  *** OLYMPUS PAINEL — BUILD v$version ***" -ForegroundColor Yellow
Write-Host ""

# ── Verificações de ambiente ──────────────────────────────────────────────────
Write-Step "Verificando ambiente"

if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
    Write-Fail "Node.js não encontrado. Instale em https://nodejs.org"
    exit 1
}
Write-OK "Node.js: $(node --version)"

if (-not (Get-Command "python" -ErrorAction SilentlyContinue)) {
    Write-Fail "Python não encontrado. Instale em https://python.org"
    exit 1
}
Write-OK "Python: $(python --version)"

if (-not (Get-Command "pip" -ErrorAction SilentlyContinue)) {
    Write-Fail "pip não encontrado."
    exit 1
}
Write-OK "pip disponível"

# ── Passo 1: Instalar dependências Python ────────────────────────────────────
if (-not $SkipBackend) {
    Write-Step "Instalando dependências Python"
    pip install -r backend\requirements.txt --quiet
    pip install pyinstaller --quiet
    Write-OK "Dependências Python instaladas"
    
    # Garante que o Playwright tem os browsers
    Write-Host "Verificando Playwright Chromium..." -ForegroundColor Gray
    python -m playwright install chromium 2>&1 | Out-Null
    Write-OK "Playwright Chromium OK"
}

# ── Passo 2: Compilar o backend Python (PyInstaller) ─────────────────────────
if (-not $SkipBackend) {
    Write-Step "Compilando backend Python"
    
    if (Test-Path "resources\backend") {
        Remove-Item -Recurse -Force "resources\backend"
    }
    New-Item -ItemType Directory -Force -Path "resources\backend" | Out-Null

    Push-Location backend
    try {
        $pyArgs = @("build_backend.spec", "--distpath", "..\resources\backend", "--workpath", "..\build\pyinstaller", "--noconfirm")
        if (-not $Verbose) { $pyArgs += "--log-level", "WARN" }
        
        pyinstaller @pyArgs
        if ($LASTEXITCODE -ne 0) { throw "PyInstaller falhou com código $LASTEXITCODE" }
    }
    finally {
        Pop-Location
    }
    
    if (-not (Test-Path "resources\backend\backend.exe")) {
        Write-Fail "backend.exe não foi gerado!"
        exit 1
    }
    Write-OK "backend.exe gerado com sucesso"
}

# ── Passo 3: Instalar dependências Node.js ───────────────────────────────────
if (-not $SkipFrontend) {
    Write-Step "Instalando dependências Node.js"
    npm install --loglevel=error
    Write-OK "Dependências Node.js instaladas"
}

# ── Passo 4: Compilar frontend React (Vite) ──────────────────────────────────
if (-not $SkipFrontend) {
    Write-Step "Compilando frontend React (Vite)"
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Build do frontend falhou" }
    Write-OK "Frontend compilado em dist/"
}

# ── Passo 5: Gerar instalador Windows (electron-builder) ────────────────────
Write-Step "Gerando instalador Windows"

npx electron-builder build --win --publish never
if ($LASTEXITCODE -ne 0) { throw "electron-builder falhou" }

# ── Resultado ────────────────────────────────────────────────────────────────
$installerPath = Get-ChildItem "release\$version" -Filter "*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($installerPath) {
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host " BUILD CONCLUÍDO COM SUCESSO!" -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host " Versão  : v$version" -ForegroundColor White
    Write-Host " Arquivo : $($installerPath.FullName)" -ForegroundColor White
    Write-Host " Tamanho : $([Math]::Round($installerPath.Length / 1MB, 1)) MB" -ForegroundColor White
    Write-Host ""
} else {
    Write-Fail "Nenhum instalador .exe encontrado em release/$version"
}
