# Install a Herdr App mod and optional personal layout. No Python/Node.
param([Parameter(Position = 0)][string]$Mod = 'project-open', [switch]$Update)
$ErrorActionPreference = 'Stop'
if ($Mod -notmatch '^[A-Za-z0-9][A-Za-z0-9_-]*$') { throw "Invalid mod: $Mod" }
$repo = Split-Path -Parent $PSScriptRoot
$src = Join-Path (Join-Path $repo 'mods') $Mod
if (!(Test-Path -LiteralPath (Join-Path $src 'main.js')) -or !(Test-Path -LiteralPath (Join-Path $src 'mod.json'))) {
  throw "Unknown mod: $Mod"
}
# Official app home: ~/.config/herdr-app on Windows, macOS and Linux.
if ($env:HERDR_APP_HOME) { $homeDir = $env:HERDR_APP_HOME }
elseif ($env:XDG_CONFIG_HOME) { $homeDir = Join-Path $env:XDG_CONFIG_HOME 'herdr-app' }
else { $homeDir = Join-Path (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.config') 'herdr-app' }
$dst = Join-Path (Join-Path $homeDir 'mods') $Mod
$layoutSrc = Join-Path (Join-Path $repo 'layouts') "$Mod.json"
$layoutDst = Join-Path (Join-Path $homeDir 'layouts') "$Mod.json"
$hasLayout = Test-Path -LiteralPath $layoutSrc
if (!$Update) {
  if (Test-Path -LiteralPath $dst) { throw "Already installed: $dst (use -Update)" }
  if ($hasLayout -and (Test-Path -LiteralPath $layoutDst)) { throw "Personal layout exists: $layoutDst" }
}
New-Item -ItemType Directory -Force -Path (Join-Path $homeDir 'mods') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $homeDir 'layouts') | Out-Null
if ($Update -and (Test-Path -LiteralPath $dst)) {
  $backup = "$dst.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  if (Test-Path -LiteralPath $backup) { throw "Backup collision: $backup" }
  Move-Item -LiteralPath $dst -Destination $backup
  Write-Host "Backed up mod: $backup"
}
Copy-Item -LiteralPath $src -Destination $dst -Recurse
Write-Host "Installed mod: $dst"
if ($hasLayout) {
  if (!(Test-Path -LiteralPath $layoutDst)) {
    Copy-Item -LiteralPath $layoutSrc -Destination $layoutDst
    Write-Host "Installed personal layout: $layoutDst"
  } else {
    Write-Host "Preserved existing layout: $layoutDst"
  }
  Write-Host "In Herdr App switch to layout '$Mod'."
  Write-Host "Optional CLI: herdr-app do layout.switch --name $Mod"
}
Write-Host "Validate: herdr-app check \`"$dst\`""
