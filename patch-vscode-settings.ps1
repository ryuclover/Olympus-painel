$settingsPath = Join-Path $env:APPDATA "Code\User\settings.json"
$raw = Get-Content $settingsPath -Raw | ConvertFrom-Json

# Disable Dynamic Forwarding (causes Daytona SSH to close connection)
$raw | Add-Member -MemberType NoteProperty -Name "remote.SSH.enableDynamicForwarding" -Value $false -Force

# Add olympus-cloud to known linux platforms
$platforms = $raw."remote.SSH.remotePlatform"
$platforms | Add-Member -MemberType NoteProperty -Name "olympus-cloud" -Value "linux" -Force
$raw."remote.SSH.remotePlatform" = $platforms

$raw | ConvertTo-Json -Depth 10 | Set-Content -Path $settingsPath -Encoding UTF8
Write-Host "VS Code user settings atualizadas!" -ForegroundColor Green
Write-Host "  remote.SSH.enableDynamicForwarding = false" -ForegroundColor Cyan
Write-Host "  remote.SSH.remotePlatform: olympus-cloud = linux" -ForegroundColor Cyan
