$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$tempHome = Join-Path ([System.IO.Path]::GetTempPath()) ("herdr-mod-test-" + [guid]::NewGuid().ToString("N"))
$previous = $env:HERDR_APP_HOME
try {
  $env:HERDR_APP_HOME = $tempHome
  & (Join-Path $repo 'scripts/install.ps1')
  if (!(Test-Path -LiteralPath (Join-Path $tempHome 'mods/project-open/main.js'))) { throw "Missing mod" }
  $layout = Join-Path $tempHome 'layouts/project-open.json'
  if (!(Test-Path -LiteralPath $layout)) { throw "Missing layout" }
  $rejected = $false
  try { & (Join-Path $repo 'scripts/install.ps1') } catch { $rejected = $true }
  if (!$rejected) { throw "Expected overwrite protection" }
  Add-Content -LiteralPath $layout -Value 'customized-layout-marker'
  & (Join-Path $repo 'scripts/install.ps1') -Update
  if (!(Select-String -LiteralPath $layout -Pattern 'customized-layout-marker' -Quiet)) { throw "Layout overwritten" }
  $backups = @(Get-ChildItem -LiteralPath (Join-Path $tempHome 'mods') -Directory -Filter 'project-open.bak-*')
  if ($backups.Count -lt 1) { throw "No backup" }
  Write-Host 'PASS: PowerShell install, protection, backup and layout preservation'
} finally {
  $env:HERDR_APP_HOME = $previous
  if (Test-Path -LiteralPath $tempHome) { Remove-Item -LiteralPath $tempHome -Recurse -Force }
}
