param(
  [switch]$SkipDeploy,
  [switch]$ChatOnly,
  [string]$AlertSecret
)

$ErrorActionPreference = "Stop"

function New-SecretValue([string]$Prefix) {
  $bytes = New-Object byte[] 18
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  $raw = [Convert]::ToBase64String($bytes).Replace("+", "").Replace("/", "").Replace("=", "")
  return "$Prefix`_$raw"
}

function Read-RequiredSecret([string]$Label) {
  do {
    $value = Read-Host -Prompt $Label
    $value = $value.Trim()
    if (-not $value) {
      Write-Host "This value is required." -ForegroundColor Yellow
    }
  } while (-not $value)
  return $value
}

function Read-OptionalSecret([string]$Label) {
  $value = Read-Host -Prompt $Label
  return $value.Trim()
}

function Set-VercelEnv([string]$Name, [string]$Value) {
  if (-not $Value) {
    Write-Host "Skipping $Name." -ForegroundColor DarkYellow
    return
  }

  $tmp = New-TemporaryFile
  try {
    Set-Content -LiteralPath $tmp.FullName -Value $Value -NoNewline
    Write-Host "Setting $Name in Vercel Production..." -ForegroundColor Cyan
    $previousErrorAction = $ErrorActionPreference
    $previousNativeErrorAction = $null
    $hasNativePreference = Get-Variable -Name PSNativeCommandUseErrorActionPreference -Scope Global -ErrorAction SilentlyContinue
    if ($hasNativePreference) {
      $previousNativeErrorAction = $Global:PSNativeCommandUseErrorActionPreference
      $Global:PSNativeCommandUseErrorActionPreference = $false
    }
    $ErrorActionPreference = "Continue"
    try {
      cmd.exe /d /s /c "npx.cmd vercel env rm $Name production -y >nul 2>nul" | Out-Null
      $addCommand = "type `"$($tmp.FullName)`" | npx.cmd vercel env add $Name production 2>&1"
      $output = cmd.exe /d /s /c $addCommand
      $exit = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $previousErrorAction
      if ($hasNativePreference) {
        $Global:PSNativeCommandUseErrorActionPreference = $previousNativeErrorAction
      }
    }
    if ($exit -ne 0) {
      throw "Could not add $Name to Vercel Production. $($output -join ' ')"
    }
  } finally {
    Remove-Item -LiteralPath $tmp.FullName -Force -ErrorAction SilentlyContinue
  }
}

function Deploy-Production {
  if ($SkipDeploy) {
    Write-Host "Skipping deploy because -SkipDeploy was passed." -ForegroundColor DarkYellow
    return
  }
  Write-Host "Deploying production..." -ForegroundColor Cyan
  & npx.cmd vercel deploy --prod -y
}

function Get-ChatId([string]$AlertSecret) {
  $url = "https://www.spyprophet.app/api/alerts/telegram/chat-id?secret=$([uri]::EscapeDataString($AlertSecret))"
  Write-Host "Reading Telegram chat updates..." -ForegroundColor Cyan
  $response = Invoke-RestMethod -Uri $url -Method Get
  if (-not $response.chats -or $response.chats.Count -eq 0) {
    return $null
  }
  return [string]$response.chats[0].chatId
}

function Resolve-ChatId([string]$AlertSecret) {
  Write-Host ""
  Write-Host "Open this bot link, press Start, then send a fresh message:" -ForegroundColor Green
  Write-Host "https://t.me/SPYProphetBot" -ForegroundColor Cyan
  Write-Host ""

  for ($attempt = 1; $attempt -le 6; $attempt++) {
    Read-Host "After you send a NEW hello message, press Enter here"
    $chatId = Get-ChatId $AlertSecret
    if ($chatId) {
      return $chatId
    }

    Write-Host "No chat found yet." -ForegroundColor Yellow
    Write-Host "Make sure you pressed Start inside Telegram and sent a new hello after the first deploy finished." -ForegroundColor Gray
    $manual = Read-Host "If you already opened the chat-id URL and see chatId, paste it here. Otherwise press Enter to retry"
    $manual = $manual.Trim()
    if ($manual) {
      return $manual
    }
  }

  throw "No Telegram chat found. Send /start and hello to https://t.me/SPYProphetBot, then rerun this script."
}

Write-Host ""
Write-Host "SPY Prophet Telegram Alert Setup" -ForegroundColor Green
Write-Host "Your token is entered only into this PowerShell window. It is not printed back." -ForegroundColor Gray
Write-Host ""

if ($ChatOnly) {
  Write-Host "Chat-only mode: skipping TELEGRAM_BOT_TOKEN, CRON_SECRET, and Upstash setup." -ForegroundColor Cyan
  $alertSecret = $AlertSecret.Trim()
  if (-not $alertSecret) {
    $alertSecret = Read-RequiredSecret "Paste your ALERT_SECRET"
  }
  $telegramToken = ""
  $cronSecret = ""
  $upstashUrl = ""
  $upstashToken = ""
} else {
  $telegramToken = Read-RequiredSecret "Paste TELEGRAM_BOT_TOKEN from BotFather"
  $alertSecret = Read-OptionalSecret "ALERT_SECRET (press Enter to auto-generate)"
  if (-not $alertSecret) { $alertSecret = New-SecretValue "prophet_alert" }

  $cronSecret = Read-OptionalSecret "CRON_SECRET (press Enter to auto-generate)"
  if (-not $cronSecret) { $cronSecret = New-SecretValue "prophet_cron" }

  Write-Host ""
  Write-Host "Upstash Redis prevents duplicate alerts. Press Enter to skip for now, but live monitoring will stay pending until it is added." -ForegroundColor Yellow
  $upstashUrl = Read-OptionalSecret "UPSTASH_REDIS_REST_URL"
  $upstashToken = Read-OptionalSecret "UPSTASH_REDIS_REST_TOKEN"

  Set-VercelEnv "TELEGRAM_BOT_TOKEN" $telegramToken
  Set-VercelEnv "ALERT_SECRET" $alertSecret
  Set-VercelEnv "CRON_SECRET" $cronSecret
  Set-VercelEnv "UPSTASH_REDIS_REST_URL" $upstashUrl
  Set-VercelEnv "UPSTASH_REDIS_REST_TOKEN" $upstashToken

  Deploy-Production
}

$chatId = Resolve-ChatId $alertSecret

Write-Host "Found Telegram chat ID: $chatId" -ForegroundColor Green
Set-VercelEnv "TELEGRAM_CHAT_ID" $chatId

Deploy-Production

$testUrl = "https://www.spyprophet.app/api/alerts/telegram/test?secret=$([uri]::EscapeDataString($alertSecret))"
Write-Host "Sending test alert..." -ForegroundColor Cyan
$test = Invoke-RestMethod -Uri $testUrl -Method Get

Write-Host ""
if ($test.ok) {
  Write-Host "Telegram alerts are connected. Check your phone for the test message." -ForegroundColor Green
} else {
  Write-Host "The test endpoint responded, but Telegram did not confirm delivery." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Keep this ALERT_SECRET somewhere private:" -ForegroundColor Yellow
Write-Host $alertSecret
