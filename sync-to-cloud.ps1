$ApiKey = "dtn_2cfe2bb0ca3d89ccd530e5c974e670f56717a51bd24eff153bed930d00a27430"
$SandboxId = "0bec384d-90e5-4f00-89c1-176e5ddab184"

Write-Host "Obtendo credencial SSH do Daytona Cloud..." -ForegroundColor Cyan
$res = Invoke-RestMethod -Method Post -Uri "https://app.daytona.io/api/sandbox/$SandboxId/ssh-access" -Headers @{ Authorization = "Bearer $ApiKey" }
$token = $res.token

Write-Host "Compactando e enviando arquivos para o servidor remoto..." -ForegroundColor Cyan
$archivePath = "$env:TEMP\olympus_sync.tar.gz"

if (Test-Path $archivePath) { Remove-Item $archivePath -Force }

# Create tar excluding node_modules and .git
tar -czf $archivePath --exclude="node_modules" --exclude=".git" --exclude="*.log" backend dist olympus-admin/dist

# Send via SCP
scp -o StrictHostKeyChecking=no $archivePath "$token@ssh.app.daytona.io:/home/daytona/olympus_sync.tar.gz"

# Extract and restart backend on cloud
Write-Host "Extraindo no servidor e configurando ambiente..." -ForegroundColor Cyan
$remoteCmd = 'mkdir -p /home/daytona/olympus && cd /home/daytona/olympus && tar -xzf /home/daytona/olympus_sync.tar.gz && rm /home/daytona/olympus_sync.tar.gz'
ssh -o StrictHostKeyChecking=no "$token@ssh.app.daytona.io" $remoteCmd

Remove-Item $archivePath -Force -ErrorAction SilentlyContinue

Write-Host "Sincronizacao concluida com sucesso!" -ForegroundColor Green
