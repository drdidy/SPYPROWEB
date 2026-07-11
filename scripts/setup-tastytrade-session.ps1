$ErrorActionPreference = "Stop"

param(
  [switch] $SkipVercel,
  [switch] $Deploy
)

function Read-ExistingEnvValue {
  param([string[]] $Names)

  foreach ($name in $Names) {
    $envValue = [Environment]::GetEnvironmentVariable($name, "Process")
    if ($envValue) {
      return $envValue.Trim()
    }
  }

  foreach ($file in @(".env.local", ".env.production.local")) {
    if (-not (Test-Path -LiteralPath $file)) { continue }
    foreach ($line in Get-Content -LiteralPath $file) {
      foreach ($name in $Names) {
        if ($line -match "^\s*$([regex]::Escape($name))\s*=\s*(.*)$") {
          return ($Matches[1].Trim().Trim('"').Trim("'"))
        }
      }
    }
  }

  return ""
}

function Read-RequiredValue {
  param(
    [string] $Label,
    [string[]] $EnvNames
  )

  $existing = Read-ExistingEnvValue -Names $EnvNames
  if ($existing) {
    $answer = Read-Host "$Label found locally. Press Enter to reuse it, or paste a replacement"
    if ($answer.Trim()) { return $answer.Trim() }
    return $existing
  }

  do {
    $value = Read-Host $Label
    $value = $value.Trim()
  } while (-not $value)
  return $value
}

function Read-SecretPlainText {
  param([string] $Prompt)

  $secure = Read-Host $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Assert-Command {
  param([string] $Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is required but was not found in PATH."
  }
}

function Invoke-Cmd {
  param(
    [string] $Command,
    [string] $InputText = "",
    [int] $TimeoutSeconds = 120
  )

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "cmd.exe"
  $psi.Arguments = "/d /s /c $Command"
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $psi
  [void] $process.Start()

  if ($InputText) {
    $process.StandardInput.WriteLine($InputText)
  }
  $process.StandardInput.Close()

  if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
    try { $process.Kill() } catch {}
    throw "Command timed out: $Command"
  }

  $output = ($process.StandardOutput.ReadToEnd() + $process.StandardError.ReadToEnd()).Trim()
  if ($output) {
    Write-Host $output
  }

  return [pscustomobject] @{
    ExitCode = $process.ExitCode
    Output = $output
  }
}

function Set-VercelSecret {
  param(
    [string] $Name,
    [string] $Value
  )

  Write-Host "Updating $Name in Vercel Production..."
  $remove = Invoke-Cmd -Command "npx.cmd vercel env rm $Name production -y" -TimeoutSeconds 120
  if ($remove.ExitCode -ne 0) {
    Write-Host "No existing $Name removed, or Vercel reported it was not present."
  }

  $add = Invoke-Cmd -Command "npx.cmd vercel env add $Name production" -InputText $Value -TimeoutSeconds 180
  if ($add.ExitCode -ne 0) {
    throw "Vercel env add failed for $Name.`n$($add.Output)"
  }

  Write-Host "$Name updated in Vercel Production."
}

function Get-TastytradeBaseCandidates {
  return @("https://api.tastytrade.com", "https://api.tastyworks.com")
}

function Request-TastytradeSession {
  param(
    [string] $Login,
    [string] $Password
  )

  $payloads = @(
    (@{
      login = $Login
      password = $Password
      "remember-me" = $true
    } | ConvertTo-Json -Compress),
    (@{
      login = $Login
      password = $Password
      rememberMe = $true
    } | ConvertTo-Json -Compress)
  )

  foreach ($base in (Get-TastytradeBaseCandidates)) {
    foreach ($payload in $payloads) {
      try {
        Write-Host "Creating tastytrade session at $base..."
        $response = Invoke-RestMethod `
          -Uri "$base/sessions" `
          -Method Post `
          -Headers @{
            Accept = "application/json"
            "User-Agent" = "SPYProphet/1.0"
          } `
          -ContentType "application/json" `
          -Body $payload `
          -TimeoutSec 45

        $data = if ($response.data) { $response.data } else { $response }
        $sessionToken = [string] $data.'session-token'
        $rememberToken = [string] $data.'remember-token'
        if ($sessionToken -and $rememberToken) {
          return [pscustomobject] @{
            BaseUrl = $base
            SessionToken = $sessionToken
            RememberToken = $rememberToken
          }
        }
      } catch {
        Write-Host "Session request failed at ${base}: $($_.Exception.Message)"
      }
    }
  }

  throw "Tastytrade did not return a session token and remember token. Confirm the login, password, environment, and any two-factor requirements."
}

function Test-TastytradeQuoteToken {
  param([string] $SessionToken)

  foreach ($base in (Get-TastytradeBaseCandidates)) {
    foreach ($authorization in @($SessionToken, "Bearer $SessionToken")) {
      try {
        $response = Invoke-RestMethod `
          -Uri "$base/api-quote-tokens" `
          -Method Get `
          -Headers @{
            Accept = "application/json"
            Authorization = $authorization
            "User-Agent" = "SPYProphet/1.0"
          } `
          -TimeoutSec 45

        $data = if ($response.data) { $response.data } else { $response }
        if ($data.token -and $data.'dxlink-url') {
          return [pscustomobject] @{
            BaseUrl = $base
            DxlinkHost = ([uri] $data.'dxlink-url').Host
          }
        }
      } catch {
        # Try the next authorization shape/base URL.
      }
    }
  }

  throw "The session was created, but tastytrade did not return a quote-streaming token. The app will not be able to pull option candles until this succeeds."
}

function Write-PrivateBackup {
  param(
    [string] $Login,
    [string] $RememberToken
  )

  $dir = Join-Path (Get-Location) ".data"
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $path = Join-Path $dir "tastytrade-session-latest.env"
  $content = @(
    "# Generated by scripts/setup-tastytrade-session.ps1"
    "# Keep this private. It contains the reusable tastytrade remember token."
    "TASTYTRADE_LOGIN=$Login"
    "TASTYTRADE_REMEMBER_TOKEN=$RememberToken"
  ) -join [Environment]::NewLine
  Set-Content -LiteralPath $path -Value $content -NoNewline
  Write-Host "Private backup written to $path"
}

Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  if (-not $SkipVercel) {
    Assert-Command "npx.cmd"
  }

  $login = Read-RequiredValue -Label "Tastytrade login or email" -EnvNames @("TASTYTRADE_LOGIN", "TASTYTRADE_USERNAME")
  $password = Read-SecretPlainText -Prompt "Tastytrade password (used once, not saved)"
  if (-not $password) {
    throw "A tastytrade password is required to generate the remember token."
  }

  $session = Request-TastytradeSession -Login $login -Password $password
  $quote = Test-TastytradeQuoteToken -SessionToken $session.SessionToken

  Write-Host "Fresh tastytrade remember token generated."
  Write-Host "Quote-streaming token verified through $($quote.BaseUrl) ($($quote.DxlinkHost))."

  Write-PrivateBackup -Login $login -RememberToken $session.RememberToken

  if (-not $SkipVercel) {
    Set-VercelSecret -Name "TASTYTRADE_LOGIN" -Value $login
    Set-VercelSecret -Name "TASTYTRADE_REMEMBER_TOKEN" -Value $session.RememberToken

    Write-Host "Tastytrade session envs updated. Redeploy is required for Production to read them."
    if ($Deploy) {
      Write-Host "Deploying Production..."
      $deployResult = Invoke-Cmd -Command "npx.cmd vercel deploy --prod -y" -TimeoutSeconds 900
      if ($deployResult.ExitCode -ne 0) {
        throw "Production deploy failed.`n$($deployResult.Output)"
      }
    } else {
      Write-Host "Run this after the env update: npx.cmd vercel deploy --prod -y"
    }
  }
} finally {
  Pop-Location
}
