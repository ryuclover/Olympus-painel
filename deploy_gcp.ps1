# ==============================================================================
# Script de Deploy Automatizado: Olympus Painel -> Google Cloud (Always Free Tier)
# ==============================================================================

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "   OLYMPUS PAINEL - DEPLOY NO GOOGLE CLOUD (CLOUD RUN)" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

# 1. Verifica se gcloud CLI está instalado
$gcloudCmd = Get-Command gcloud -ErrorAction SilentlyContinue
if (-not $gcloudCmd) {
    Write-Host "`n[AVISO] A ferramenta 'gcloud CLI' não foi encontrada no seu terminal." -ForegroundColor Yellow
    Write-Host "Para instalar o Google Cloud SDK no Windows com 1 comando:" -ForegroundColor Gray
    Write-Host "  (New-Object Net.WebClient).DownloadFile('https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe', '$env:TEMP\GoogleCloudSDKInstaller.exe'); Start-Process '$env:TEMP\GoogleCloudSDKInstaller.exe'" -ForegroundColor Green
    Write-Host "`nOu baixe o instalador oficial em: https://cloud.google.com/sdk/docs/install#windows" -ForegroundColor White
    exit 1
}

Write-Host "`n[1/4] Verificando autenticação no Google Cloud..." -ForegroundColor Yellow
gcloud auth print-access-token 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Você precisa fazer login na sua conta do Google Cloud:" -ForegroundColor Yellow
    gcloud auth login
}

# 2. Selecionar ou definir ID do projeto
$currentProject = (gcloud config get-value project 2>$null)
if (-not $currentProject) {
    Write-Host "`n[2/4] Nenhum projeto ativo configurado no gcloud." -ForegroundColor Yellow
    $projectId = Read-Host "Digite o ID do seu projeto no Google Cloud (ex: olympus-painel-123)"
    gcloud config set project $projectId
} else {
    Write-Host "`n[2/4] Usando projeto ativo: $currentProject" -ForegroundColor Green
}

# 3. Habilita APIs necessárias no nível gratuito
Write-Host "`n[3/4] Habilitando APIs gratuitas do Google Cloud (Cloud Run & Cloud Build)..." -ForegroundColor Yellow
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# 4. Deploy no Cloud Run
Write-Host "`n[4/4] Iniciando build e deploy no Google Cloud Run (us-central1 - Região Gratuita)..." -ForegroundColor Yellow
Write-Host "Isso compila a imagem Docker na nuvem do Google e publica a aplicação..." -ForegroundColor Gray

gcloud run deploy olympus-app `
    --source . `
    --region us-central1 `
    --platform managed `
    --allow-unauthenticated `
    --memory 512Mi `
    --cpu 1 `
    --min-instances 0 `
    --max-instances 2 `
    --port 8080

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n======================================================" -ForegroundColor Green
    Write-Host "   DEPLOY CONCLUÍDO COM SUCESSO NO GOOGLE CLOUD!      " -ForegroundColor Green
    Write-Host "======================================================" -ForegroundColor Green
    Write-Host "O painel Web, o Admin e o Backend já estão online com SSL gratuito." -ForegroundColor White
} else {
    Write-Host "`n[ERRO] Ocorreu um problema durante o deploy. Verifique as mensagens acima." -ForegroundColor Red
}
