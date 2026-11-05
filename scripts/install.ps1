# Install a Herdr App mod and patch the shared personal layout.
# Checkout: powershell -File install.ps1 [-Mod name] [-Update] [-NoLayout]
# Piped:    irm .../install.ps1 | iex
param(
  [Parameter(Position = 0)][string]$Mod = 'project-open',
  [switch]$Update,
  [switch]$NoLayout
)
$ErrorActionPreference = 'Stop'
if ($PSScriptRoot) { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 }
function Step([string]$Message) {
  Write-Host '  ' -NoNewline
  Write-Host '✓' -NoNewline -ForegroundColor Green
  Write-Host " $Message" -ForegroundColor DarkGray
}
function Warn([string]$Message) {
  Write-Host '  ' -NoNewline
  Write-Host '!' -NoNewline -ForegroundColor Yellow
  Write-Host " $Message"
}
# Piped one-liner: $PSScriptRoot is empty, so stage the source archive instead.
if (!$PSScriptRoot) {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $stage = Join-Path ([System.IO.Path]::GetTempPath()) ("herdr-mods-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $stage -Force | Out-Null
  Write-Host '  fetching herdr-mods' -ForegroundColor DarkGray
  Invoke-WebRequest -Uri 'https://github.com/hheei/herdr-mods/archive/refs/heads/main.zip' -OutFile (Join-Path $stage 'source.zip')
  Expand-Archive -LiteralPath (Join-Path $stage 'source.zip') -DestinationPath $stage
  try { & (Join-Path $stage 'herdr-mods-main/scripts/install.ps1') -Mod $Mod -Update:$Update -NoLayout:$NoLayout }
  finally { Remove-Item -LiteralPath $stage -Recurse -Force }
  return
}
$layoutName = 'herdr-mods'
$repo = Split-Path -Parent $PSScriptRoot
$src = Join-Path (Join-Path $repo 'mods') $Mod
if (!(Test-Path -LiteralPath (Join-Path $src 'main.js'))) { throw "Unknown mod: $Mod" }
if ($env:HERDR_APP_HOME) { $homeDir = $env:HERDR_APP_HOME }
elseif ($env:XDG_CONFIG_HOME) { $homeDir = Join-Path $env:XDG_CONFIG_HOME 'herdr-app' }
else { $homeDir = Join-Path (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.config') 'herdr-app' }
$dst = Join-Path (Join-Path $homeDir 'mods') $Mod
$layoutDst = Join-Path (Join-Path $homeDir 'layouts') "$layoutName.json"
if (!$Update -and (Test-Path -LiteralPath $dst)) { throw "Already installed: $dst (use -Update)" }
Write-Host ''
Write-Host "  herdr-mods " -NoNewline -ForegroundColor White
Write-Host "· $Mod" -ForegroundColor DarkGray
Write-Host ''
New-Item -ItemType Directory -Force -Path (Join-Path $homeDir 'mods') | Out-Null
if (!$NoLayout) {
  New-Item -ItemType Directory -Force -Path (Join-Path $homeDir 'layouts') | Out-Null
  if (!(Test-Path -LiteralPath $layoutDst)) {
    $base = Join-Path (Join-Path $homeDir 'layouts') 'main.json'
    if (!(Test-Path -LiteralPath $base)) { $base = Join-Path (Join-Path $repo 'layouts') 'herdr-mods.json' }
    Copy-Item -LiteralPath $base -Destination $layoutDst
  }
  $before = Get-Content -LiteralPath $layoutDst -Raw
  $data = $before | ConvertFrom-Json
  $sidebar = @($data.children | Where-Object { $_.id -eq 'sidebar' })[0]
  $patch = $true
  if ($Mod -eq 'project-open') {
    # Project Open renders the whole status bar, so drop earlier sidebar copies
    # and collapse the split-row layout used by older releases.
    if ($sidebar) { $sidebar.children = @($sidebar.children | Where-Object { $_.id -ne $Mod }) }
    $work = @($data.children | Where-Object { $_.id -eq 'work' })[0]
    $status = @($work.children | Where-Object { $_.id -eq 'status' })[0]
    if ($status.type -eq 'row') {
      if (@($status.children).Count -ne 2) {
        $patch = $false
      } else {
        $block = [pscustomobject]@{
          id = 'status'; type = 'block'
          size = [pscustomobject]@{ px = 28 }
          content = [pscustomobject]@{ mod = 'project-open' }
        }
        $work.children = @($work.children | ForEach-Object { if ($_.id -eq 'status') { $block } else { $_ } })
      }
    } elseif ($status.content.mod -in @('workspace-status', 'project-open')) {
      $status.content.mod = 'project-open'
    } else {
      $patch = $false
    }
  } elseif (!$sidebar) {
    $patch = $false
  } elseif (@($sidebar.children | Where-Object { $_.id -eq $Mod }).Count -eq 0) {
    $children = @()
    foreach ($child in @($sidebar.children)) {
      if ($child.id -eq 'sidebar-footer') {
        $children += [pscustomobject]@{
          id = $Mod; type = 'block'
          size = [pscustomobject]@{ px = 38 }
          content = [pscustomobject]@{ mod = $Mod }
        }
      }
      $children += $child
    }
    $sidebar.children = $children
  }
  if (!$patch) {
    Warn 'layout left unchanged; add the mod by hand'
  } else {
    $rendered = $data | ConvertTo-Json -Depth 100
    if ($rendered.Trim() -ne $before.Trim()) {
      Copy-Item -LiteralPath $layoutDst -Destination "$layoutDst.bak" -Force
      [System.IO.File]::WriteAllText($layoutDst, $rendered + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
      Step "layout $layoutName patched (backup: $layoutName.json.bak)"
    }
  }
}
if ($Update -and (Test-Path -LiteralPath $dst)) {
  if (Test-Path -LiteralPath "$dst.bak") { Remove-Item -LiteralPath "$dst.bak" -Recurse -Force }
  Move-Item -LiteralPath $dst -Destination "$dst.bak"
}
Copy-Item -LiteralPath $src -Destination $dst -Recurse
Step "mod installed → $dst"
if ($NoLayout) {
  Warn 'layout untouched (-NoLayout); add the mod by hand'
} else {
  Write-Host "  → switch Herdr App to layout $layoutName  ·  herdr-app check `"$dst`"" -ForegroundColor DarkGray
  Write-Host ''
}
