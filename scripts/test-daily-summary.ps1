$ErrorActionPreference = 'Stop'
$secret = '8f3a92d641e7b50c8f2a3e1d4b6c95a071fed83e4b2a76d9c8e3f1a5b074c2d6'
$url = 'https://www.bellavego.com/api/crons/daily-summary'
$headers = @{ 'x-admin-secret' = $secret }

Write-Host "GET $url (manual trigger)" -ForegroundColor Cyan
$res = Invoke-RestMethod -Method GET -Uri $url -Headers $headers
$res | ConvertTo-Json -Depth 6
Write-Host "`nSMS should have landed on +1 (773) 710-9565" -ForegroundColor Green
