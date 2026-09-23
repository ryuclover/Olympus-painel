param(
    [switch]$Interactive
)

$ApiKey = "dtn_2cfe2bb0ca3d89ccd530e5c974e670f56717a51bd24eff153bed930d00a27430"
$SandboxId = "0bec384d-90e5-4f00-89c1-176e5ddab184"

Write-Host "Obtendo credencial SSH atualizada do Daytona Cloud..." -ForegroundColor Cyan

try {
    $res = Invoke-RestMethod -Method Post -Uri "https://app.daytona.io/api/sandbox/$SandboxId/ssh-access" -Headers @{ Authorization = "Bearer $ApiKey" }
    $token = $res.token
    Write-Host "Novo token gerado com sucesso: $token" -ForegroundColor Green
    Write-Host "Expira em: $($res.expiresAt)" -ForegroundColor Yellow

    # 1. Update ~/.ssh/config
    $sshDir = Join-Path $HOME ".ssh"
    $sshConfigFile = Join-Path $sshDir "config"
    if (-not (Test-Path $sshDir)) { New-Item -ItemType Directory -Path $sshDir -Force | Out-Null }

    $hostBlock = @"
Host olympus-cloud
    HostName ssh.app.daytona.io
    User $token
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
    ServerAliveInterval 30
    ServerAliveCountMax 3
    ConnectTimeout 30
"@

    if (Test-Path $sshConfigFile) {
        $cfg = Get-Content $sshConfigFile -Raw
        if ($cfg -match 'Host olympus-cloud[\s\S]*?(?=\r?\nHost |\Z)') {
            $cfg = [regex]::Replace($cfg, 'Host olympus-cloud[\s\S]*?(?=\r?\nHost |\Z)', $hostBlock)
        } else {
            $cfg = $cfg.TrimEnd() + "`r`n`r`n" + $hostBlock
        }
        Set-Content -Path $sshConfigFile -Value $cfg -Encoding UTF8
    } else {
        Set-Content -Path $sshConfigFile -Value $hostBlock -Encoding UTF8
    }
    Write-Host "Arquivo ~/.ssh/config atualizado!" -ForegroundColor Green

    # 2. Update .vscode/settings.json (workspace)
    $settingsPath = Join-Path $PSScriptRoot ".vscode\settings.json"
    $settings = @{
        "sshfs.configs" = @(
            @{
                "name" = "Olympus-Cloud"
                "host" = "ssh.app.daytona.io"
                "port" = 22
                "username" = $token
                "root" = "/home/daytona/olympus"
            }
        )
        "terminal.integrated.profiles.windows" = @{
            "Olympus Cloud (Daytona SSH)" = @{
                "path" = "ssh.exe"
                "args" = @(
                    "-o", "StrictHostKeyChecking=no",
                    "$token@ssh.app.daytona.io"
                )
                "icon" = "cloud"
            }
        }
    }

    if (-not (Test-Path (Split-Path $settingsPath))) {
        New-Item -ItemType Directory -Path (Split-Path $settingsPath) -Force | Out-Null
    }

    $settings | ConvertTo-Json -Depth 5 | Set-Content -Path $settingsPath -Encoding UTF8
    Write-Host "Configuracoes do workspace atualizadas!" -ForegroundColor Green

    if ($Interactive) {
        Write-Host "Iniciando sessao SSH..." -ForegroundColor Cyan
        ssh -o StrictHostKeyChecking=no "$token@ssh.app.daytona.io"
    } else {
        Write-Host ""
        Write-Host "PRONTO! Tente no VS Code:" -ForegroundColor Yellow
        Write-Host "  Remote-SSH > Connect to SSH Host... > olympus-cloud" -ForegroundColor White
    }
} catch {
    Write-Host "Erro: $_" -ForegroundColor Red
}
