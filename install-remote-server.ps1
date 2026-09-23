$ApiKey = "dtn_2cfe2bb0ca3d89ccd530e5c974e670f56717a51bd24eff153bed930d00a27430"
$SandboxId = "71ac9743-d13f-4832-a49f-718778559147"
$COMMIT = "ecfbad74d93962fc8ca485d93ab9b4f3d4cb6cf8"
$IDE_VERSION = "2.5.5"

Write-Host "Obtendo credencial SSH..." -ForegroundColor Cyan
$res = Invoke-RestMethod -Method Post -Uri "https://app.daytona.io/api/sandbox/$SandboxId/ssh-access" -Headers @{ Authorization = "Bearer $ApiKey" }
$target = $res.token + "@ssh.app.daytona.io"

$serverDir = "/home/daytona/.antigravity-ide-server/bin/$IDE_VERSION-$COMMIT"
$serverScript = "$serverDir/bin/antigravity-ide-server"

Write-Host "Verificando se servidor ja esta instalado no container..." -ForegroundColor Cyan
$checkResult = ssh -o StrictHostKeyChecking=no $target "test -f $serverScript && echo 'EXISTS' || echo 'MISSING'"

if ($checkResult -eq "EXISTS") {
    Write-Host "Servidor ja instalado! Nao precisa reinstalar." -ForegroundColor Green
    exit 0
}

Write-Host "Servidor nao encontrado. Preparando pacote local..." -ForegroundColor Yellow

# Build the server tarball from local IDE installation
$ideRoot = "$env:LOCALAPPDATA\Programs\Antigravity IDE\resources\app"
$tmpDir = "$env:TEMP\agy-reh-build"
$tarOutput = "$env:TEMP\antigravity-reh.tar.gz"

if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force }
if (Test-Path $tarOutput) { Remove-Item $tarOutput -Force }
New-Item -ItemType Directory -Path "$tmpDir\bin" | Out-Null

Write-Host "Copiando arquivos da instalacao local para o pacote..." -ForegroundColor Cyan

# Copy the essential server files
# The local Windows build has the shared JS, but the server entry point needs to be
# created. The antigravity-ide-server is actually a Node.js process.
# We extract the node binary and the extensionHostProcess.js

# Check if node is bundled
$nodeExe = Get-ChildItem "$env:LOCALAPPDATA\Programs\Antigravity IDE" -Filter "node.exe" -Recurse -ErrorAction SilentlyContinue
if ($nodeExe) {
    Write-Host "Found node: $($nodeExe.FullName)" -ForegroundColor Green
} else {
    Write-Host "Node.exe not found in IDE installation." -ForegroundColor Yellow
}

# List what we have in the IDE
Get-ChildItem "$env:LOCALAPPDATA\Programs\Antigravity IDE" -Filter "*.exe" | Select-Object Name, Length
