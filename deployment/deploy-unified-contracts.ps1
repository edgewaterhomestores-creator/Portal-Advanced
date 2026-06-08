$ErrorActionPreference = "Stop"

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][scriptblock]$Command
  )

  Write-Host ""
  Write-Host "== $Label ==" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE."
  }
}

try {
  $Remote = "michelle-work@192.168.1.70"
  $Upload = "F:\customerportal-upload.tgz"
  $UploadSha = "F:\customerportal-upload.sha256.txt"
  $RemoteUpload = "/home/michelle-work/uploads/customerportal-upload.tgz"
  $RemoteUploadSha = "/home/michelle-work/uploads/customerportal-upload.sha256.txt"
  $RemoteScript = "/home/michelle-work/uploads/deploy-unified-contracts.sh"
  $LocalScript = Join-Path $PSScriptRoot "deploy-unified-contracts.sh"
  $SshOptions = @(
    "-o", "PubkeyAuthentication=no",
    "-o", "PreferredAuthentications=password,keyboard-interactive",
    "-o", "NumberOfPasswordPrompts=3"
  )

  Write-Host "Contract Portal unified deploy" -ForegroundColor Cyan
  Write-Host "Package: $Upload"

  if (!(Test-Path -LiteralPath $Upload)) {
    throw "Missing upload package: $Upload"
  }
  if (!(Test-Path -LiteralPath $UploadSha)) {
    throw "Missing upload hash file: $UploadSha"
  }
  if (!(Test-Path -LiteralPath $LocalScript)) {
    throw "Missing deploy script: $LocalScript"
  }

  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Upload).Hash
  Write-Host "Local SHA256: $hash"

  Write-Host ""
  Write-Host "You may be prompted for the SSH password and then the sudo password." -ForegroundColor Yellow
  Write-Host "Type the password into this window. It may not show characters while you type."
  Write-Host "Leave this window open until it says Deploy finished or shows an error."

  Write-Host "Remote upload folder already exists from the prior upload attempt; skipping the extra SSH prepare step."

  Invoke-Step "Upload package" {
    & scp @SshOptions $Upload "${Remote}:$RemoteUpload"
  }

  Invoke-Step "Upload package hash" {
    & scp @SshOptions $UploadSha "${Remote}:$RemoteUploadSha"
  }

  Invoke-Step "Upload deploy script" {
    & scp @SshOptions $LocalScript "${Remote}:$RemoteScript"
  }

  Invoke-Step "Run remote deploy" {
    & ssh @SshOptions -tt $Remote "chmod +x ~/uploads/deploy-unified-contracts.sh && ~/uploads/deploy-unified-contracts.sh"
  }

  Write-Host ""
  Write-Host "Checking public health endpoints from Windows..." -ForegroundColor Cyan
  $urls = @(
    "https://contracts.edgefam.com/api/health",
    "https://contracts.edgefam.us/api/health",
    "https://contracts.edgewatercabinetsfloorsandmore.com/api/health"
  )
  foreach ($url in $urls) {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20
    Write-Host "$url -> $($response.StatusCode) $($response.Content.Trim())"
  }

  Write-Host ""
  Write-Host "Deploy finished." -ForegroundColor Green
} catch {
  Write-Host ""
  Write-Host "DEPLOY ERROR" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host ""
  Write-Host "Leave this window open and tell Codex the error line above." -ForegroundColor Yellow
} finally {
  Write-Host ""
  Read-Host "Press Enter to close"
}
