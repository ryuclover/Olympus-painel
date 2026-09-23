<#
.SYNOPSIS
    Gerenciador de Energia e Conexão da Nuvem Olympus (Daytona Cloud)
.DESCRIPTION
    Permite Ligar, Desligar, ver Status e configurar Auto-Sleep da VPS.
.EXAMPLE
    .\cloud.ps1 status
    .\cloud.ps1 ligar
    .\cloud.ps1 desligar
    .\cloud.ps1 sleep 20
#>

param(
    [Parameter(Position=0)]
    [ValidateSet("status", "ligar", "start", "desligar", "stop", "sleep", "autostop", "conectar", "ssh")]
    [string]$Acao = "status",

    [Parameter(Position=1)]
    [int]$Minutos = 30
)

$ApiKey = "dtn_2cfe2bb0ca3d89ccd530e5c974e670f56717a51bd24eff153bed930d00a27430"
$SandboxId = "0bec384d-90e5-4f00-89c1-176e5ddab184"
$Headers = @{ Authorization = "Bearer $ApiKey" }

function Get-SandboxInfo {
    try {
        return Invoke-RestMethod -Uri "https://app.daytona.io/api/sandbox/$SandboxId" -Headers $Headers -ErrorAction Stop
    } catch {
        Write-Host "Erro ao consultar Daytona API: $_" -ForegroundColor Red
        return $null
    }
}

function Update-SSHConfig {
    Write-Host "Atualizando credencial SSH..." -ForegroundColor Cyan
    try {
        $res = Invoke-RestMethod -Method Post -Uri "https://app.daytona.io/api/sandbox/$SandboxId/ssh-access" -Headers $Headers
        $token = $res.token

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
        Write-Host "SSH configurado para olympus-cloud!" -ForegroundColor Green
        return $token
    } catch {
        Write-Host "Aviso: Nao foi possivel atualizar SSH: $_" -ForegroundColor Yellow
        return $null
    }
}

switch ($Acao) {
    "status" {
        $info = Get-SandboxInfo
        if (-not $info) { return }
        
        Write-Host ""
        Write-Host "====== STATUS OLYMPUS CLOUD ======" -ForegroundColor Cyan
        $corEstado = if ($info.state -eq "started") { "Green" } else { "DarkYellow" }
        Write-Host "Estado:            $($info.state.ToUpper())" -ForegroundColor $corEstado
        Write-Host "vCPU / RAM / Disco: $($info.cpu) Core / $($info.memory) GB RAM / $($info.disk) GB SSD" -ForegroundColor White
        Write-Host "Auto-Sleep:        $($info.autoStopInterval) minutos de inatividade" -ForegroundColor Yellow
        Write-Host "Ultima atividade:  $($info.lastActivityAt)" -ForegroundColor Gray
        
        if ($info.state -eq "started") {
            Write-Host "Custo Estimado:    ~$0,067 / hora (Gastando creditos)" -ForegroundColor DarkYellow
            Write-Host "Backend URL:       https://8080-$SandboxId.daytonaproxy01.net" -ForegroundColor Cyan
        } else {
            Write-Host "Custo Estimado:    $0,00 / hora (TOTALMENTE PARADO - Sem consumo)" -ForegroundColor Green
        }
        Write-Host "==================================" -ForegroundColor Cyan
        Write-Host ""
    }

    { $_ -in "ligar", "start" } {
        $info = Get-SandboxInfo
        if ($info.state -eq "started") {
            Write-Host "A maquina ja esta LIGADA!" -ForegroundColor Green
        } else {
            Write-Host "Ligando a maquina na nuvem..." -ForegroundColor Cyan
            try {
                Invoke-RestMethod -Method Post -Uri "https://app.daytona.io/api/sandbox/$SandboxId/start" -Headers $Headers | Out-Null
                Write-Host "Comando de inicio enviado. Aguardando inicializacao..." -ForegroundColor Yellow
                
                $timeout = 30
                $count = 0
                do {
                    Start-Sleep -Seconds 2
                    $count += 2
                    $info = Get-SandboxInfo
                } while ($info.state -ne "started" -and $count -lt $timeout)

                if ($info.state -eq "started") {
                    Write-Host "Maquina LIGADA com sucesso!" -ForegroundColor Green
                } else {
                    Write-Host "A maquina esta iniciando ($($info.state))..." -ForegroundColor Yellow
                }
            } catch {
                Write-Host "Erro ao ligar: $_" -ForegroundColor Red
                return
            }
        }

        # Atualiza credenciais SSH
        Update-SSHConfig | Out-Null

        # Garante que o backend esta rodando
        Write-Host "Verificando se o backend Olympus esta ativo..." -ForegroundColor Cyan
        Start-Sleep -Seconds 2
        try {
            ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 olympus-cloud "pgrep -f 'python3 app.py' >/dev/null || (cd /home/daytona/olympus/backend && nohup python3 app.py > server.log 2>&1 &)" 2>$null
            Write-Host "Backend Olympus verificado e pronto!" -ForegroundColor Green
        } catch {
            Write-Host "Aviso: Conecte via SSH para validar o backend." -ForegroundColor Yellow
        }

        Write-Host ""
        Write-Host "Tudo pronto para usar!" -ForegroundColor Green
        Write-Host "Painel Web: https://8080-$SandboxId.daytonaproxy01.net" -ForegroundColor Cyan
    }

    { $_ -in "desligar", "stop" } {
        Write-Host "Desligando a maquina na nuvem..." -ForegroundColor Yellow
        try {
            Invoke-RestMethod -Method Post -Uri "https://app.daytona.io/api/sandbox/$SandboxId/stop" -Headers $Headers | Out-Null
            Write-Host "Comando enviado. A maquina foi DESLIGADA!" -ForegroundColor Green
            Write-Host "O consumo de creditos foi INTERROMPIDO ($0,00/hora)." -ForegroundColor Cyan
        } catch {
            Write-Host "Erro ao desligar: $_" -ForegroundColor Red
        }
    }

    { $_ -in "sleep", "autostop" } {
        Write-Host "Configurando auto-desligamento por inatividade para $Minutos minutos..." -ForegroundColor Cyan
        try {
            Invoke-RestMethod -Method Post -Uri "https://app.daytona.io/api/sandbox/$SandboxId/autostop/$Minutos" -Headers $Headers | Out-Null
            Write-Host "Sucesso! A maquina vai desligar sozinha apos $Minutos minutos sem uso." -ForegroundColor Green
        } catch {
            Write-Host "Erro ao configurar auto-stop: $_" -ForegroundColor Red
        }
    }

    { $_ -in "conectar", "ssh" } {
        Update-SSHConfig | Out-Null
        Write-Host "Abrindo sessao SSH..." -ForegroundColor Cyan
        ssh olympus-cloud
    }
}
