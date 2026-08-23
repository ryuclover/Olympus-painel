param(
    [switch]$SkipBackend,     # Pula a compilação do backend Python
    [switch]$SkipFrontend,    # Pula a compilação do frontend React
    [switch]$Verbose,         # Mostra saída detalhada
    [switch]$Force            # Encerra processos sem perguntar
)

$ErrorActionPreference = "Stop"
$originalColor = $Host.UI.RawUI.ForegroundColor

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

try {
    # ── Lê a versão do package.json ──────────────────────────────────────────────
    $packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
    $version = $packageJson.version
    Write-Host ""
    Write-Host "  *** OLYMPUS PAINEL — BUILD v$version ***" -ForegroundColor Yellow
    Write-Host ""

    # ── Verificações de processos ativos ──────────────────────────────────────────
    Write-Step "Verificando processos ativos"
    $processos = Get-Process | Where-Object { $_.ProcessName -like "*backend*" -or $_.ProcessName -like "*Olympus Painel*" }
    if ($processos) {
        if ($Force) {
            Write-Host "Encerrando processos ativos..." -ForegroundColor Gray
            $processos | Stop-Process -Force
        } else {
            Write-Fail "Existem processos ativos que podem travar a build: $($processos.ProcessName -join ', ')"
            Write-Host "Feche o aplicativo e o backend ou use .\build.ps1 -Force" -ForegroundColor Yellow
            exit 1
        }
    }
    Write-OK "Nenhum conflito de processo encontrado"

    # ── Verificações de ambiente ──────────────────────────────────────────────────
    Write-Step "Verificando ambiente"

    if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
        Write-Fail "Node.js não encontrado. Instale em https://nodejs.org"
        exit 1
    }
    $nodeVer = node --version
    Write-OK "Node.js: $nodeVer"

    if (-not (Get-Command "npm" -ErrorAction SilentlyContinue)) {
        Write-Fail "npm não encontrado."
        exit 1
    }
    Write-OK "npm disponível"

    # Detecta interpretador Python (.venv vs Global)
    $PythonExe = "python"
    $root = Get-Location
    $venvPath = Join-Path $root ".venv\Scripts\python.exe"
    
    if (Test-Path $venvPath) {
        $PythonExe = (Resolve-Path $venvPath).Path
        Write-OK "Usando ambiente virtual (.venv)"
    } else {
        if (-not (Get-Command "python" -ErrorAction SilentlyContinue)) {
            Write-Fail "Python não encontrado."
            exit 1
        }
        Write-Host "Aviso: .venv não encontrada, usando Python global." -ForegroundColor Yellow
    }
    
    # Captura a versão do Python
    $pyVersionRaw = & "$PythonExe" --version 2>&1 | Out-String
    $pyVersion = $pyVersionRaw.Trim()
    Write-OK "Python: $pyVersion"

    # ── Passo 1: Instalar dependências Python ────────────────────────────────────
    if (-not $SkipBackend) {
        Write-Step "Instalando dependências Python"
        $pipArgs = @("install", "-r", "backend\requirements.txt")
        if (-not $Verbose) { $pipArgs += "--quiet" }
        
        & "$PythonExe" -m pip @pipArgs
        & "$PythonExe" -m pip install pyinstaller --quiet
        Write-OK "Dependências Python instaladas"
        
        Write-Host "Verificando Playwright Chromium..." -ForegroundColor Gray
        & "$PythonExe" -m playwright install chromium 2>&1 | Out-Null
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
            
            & "$PythonExe" -m PyInstaller @pyArgs
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
        $npmArgs = @("install")
        if (-not $Verbose) { $npmArgs += "--loglevel", "error" }
        
        npm @npmArgs
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
    if ($installerPath -and $installerPath.Length -gt 10MB) {
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
        Write-Fail "Nenhum instalador válido (.exe > 10MB) encontrado em release/$version"
        exit 1
    }
}
catch {
    Write-Fail "A build foi interrompida devido a um erro:"
    Write-Host $_.ScriptStackTrace -ForegroundColor Gray
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
finally {
    $Host.UI.RawUI.ForegroundColor = $originalColor
}
