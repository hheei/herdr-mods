$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('herdr-test-' + [guid]::NewGuid().ToString('N'))
$oldHome = $env:HERDR_APP_HOME
try {
  $env:HERDR_APP_HOME = Join-Path $tmp 'home'
  $testRepo = Join-Path $tmp 'repo'
  foreach ($sub in @('scripts','mods','layouts')) { New-Item -ItemType Directory -Force -Path (Join-Path $testRepo $sub) | Out-Null }
  Copy-Item (Join-Path $repo 'scripts/install.ps1') (Join-Path $testRepo 'scripts/install.ps1')
  Copy-Item (Join-Path $repo 'layouts/herdr-mods.json') (Join-Path $testRepo 'layouts/herdr-mods.json')
  Copy-Item -Recurse (Join-Path $repo 'mods/project-open') (Join-Path $testRepo 'mods/project-open')
  $second = Join-Path $testRepo 'mods/another-mod'
  New-Item -ItemType Directory $second | Out-Null
  'export default class Another {}' | Set-Content -LiteralPath (Join-Path $second 'main.js')
  '{"place":"none"}' | Set-Content -LiteralPath (Join-Path $second 'mod.json')
  $installer = Join-Path $testRepo 'scripts/install.ps1'
  & $installer
  $rejected = $false
  try { & $installer } catch { $rejected = $true }
  if (!$rejected) { throw 'Expected overwrite rejection' }
  & $installer -Mod another-mod
  $layout = Join-Path $env:HERDR_APP_HOME 'layouts/herdr-mods.json'
  $json = Get-Content -LiteralPath $layout -Raw | ConvertFrom-Json
  $sidebarIds = @($json.children | Where-Object id -eq 'sidebar' | ForEach-Object { $_.children.id })
  $statusIds = @($json.children | Where-Object id -eq 'work' | ForEach-Object { $_.children | Where-Object id -eq 'status' | ForEach-Object { $_.children.id } })
  if (@($statusIds | Where-Object { $_ -eq 'project-open' }).Count -ne 1) { throw 'project-open missing from status bar' }
  if (@($sidebarIds | Where-Object { $_ -eq 'another-mod' }).Count -ne 1) { throw 'another-mod duplicate/missing' }
  if (@($sidebarIds | Where-Object { $_ -eq 'project-open' }).Count -ne 0) { throw 'project-open still in sidebar' }
  & $installer -Update
  $json = Get-Content -LiteralPath $layout -Raw | ConvertFrom-Json
  $statusIds = @($json.children | Where-Object id -eq 'work' | ForEach-Object { $_.children | Where-Object id -eq 'status' | ForEach-Object { $_.children.id } })
  if (@($statusIds | Where-Object { $_ -eq 'project-open' }).Count -ne 1) { throw 'duplicated on update' }
  if (@(Get-ChildItem (Join-Path $env:HERDR_APP_HOME 'layouts') -Filter 'herdr-mods.json.bak-*').Count -lt 2) { throw 'missing backups' }
  Write-Host 'PASS: PowerShell multi-mod layout and backups'
} finally {
  $env:HERDR_APP_HOME = $oldHome
  if (Test-Path $tmp) { Remove-Item $tmp -Force -Recurse }
}
