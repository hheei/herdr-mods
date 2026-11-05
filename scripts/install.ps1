# Install a Herdr App mod and add it to a shared personal layout.
param(
  [Parameter(Position = 0)][string]$Mod = 'project-open',
  [switch]$Update,
  [string]$Layout = 'herdr-mods'
)
$ErrorActionPreference = 'Stop'
if ($Mod -notmatch '^[A-Za-z0-9][A-Za-z0-9_-]*$') { throw "Invalid mod: $Mod" }
if ($Layout -notmatch '^[A-Za-z0-9][A-Za-z0-9_-]*$' -or $Layout -in @('main','terminals','win98')) {
  throw "Choose a personal layout, not a shipped one: $Layout"
}
$repo = Split-Path -Parent $PSScriptRoot
$src = Join-Path (Join-Path $repo 'mods') $Mod
if (!(Test-Path -LiteralPath (Join-Path $src 'main.js')) -or !(Test-Path -LiteralPath (Join-Path $src 'mod.json'))) { throw "Unknown mod: $Mod" }
if ($env:HERDR_APP_HOME) { $homeDir = $env:HERDR_APP_HOME }
elseif ($env:XDG_CONFIG_HOME) { $homeDir = Join-Path $env:XDG_CONFIG_HOME 'herdr-app' }
else { $homeDir = Join-Path (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.config') 'herdr-app' }
$dst = Join-Path (Join-Path $homeDir 'mods') $Mod
$layoutDst = Join-Path (Join-Path $homeDir 'layouts') "$Layout.json"
if (!$Update -and (Test-Path -LiteralPath $dst)) { throw "Already installed: $dst (use -Update)" }
New-Item -ItemType Directory -Force -Path (Join-Path $homeDir 'mods') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $homeDir 'layouts') | Out-Null
if (!(Test-Path -LiteralPath $layoutDst)) {
  $base = Join-Path (Join-Path $homeDir 'layouts') 'main.json'
  if (!(Test-Path -LiteralPath $base)) { $base = Join-Path (Join-Path $repo 'layouts') 'herdr-mods.json' }
  if (!(Test-Path -LiteralPath $base)) { throw "Missing layout template" }
  Copy-Item -LiteralPath $base -Destination $layoutDst
  Write-Host "Created personal layout: $layoutDst"
}
# JSON-aware patching; preserve the original status display and existing mods.
$data = Get-Content -LiteralPath $layoutDst -Raw | ConvertFrom-Json
$sidebar = @($data.children | Where-Object { $_.id -eq 'sidebar' })
if ($sidebar.Count -ne 1) { throw "Expected exactly one sidebar in $layoutDst" }
$changed = $false
if ($Mod -eq 'project-open') {
  # Migrate earlier project-open releases from the sidebar.
  $kept = @($sidebar[0].children | Where-Object { $_.id -ne $Mod })
  if ($kept.Count -ne @($sidebar[0].children).Count) {
    $sidebar[0].children = $kept
    $changed = $true
  }
  $work = @($data.children | Where-Object { $_.id -eq 'work' })
  if ($work.Count -ne 1) { throw "Expected one work column." }
  $status = @($work[0].children | Where-Object { $_.id -eq 'status' })
  if ($status.Count -ne 1) { throw "Expected one status node." }
  if ($status[0].type -eq 'block') {
    # Original status becomes a flexible child. Project Open gets 32 px at the right.
    $status[0].id = 'status-original'
    $status[0].size = [pscustomobject]@{ weight = 1 }
    $button = [pscustomobject]@{
      id = $Mod; type = 'block'
      size = [pscustomobject]@{ px = 32 }
      content = [pscustomobject]@{ mod = $Mod }
    }
    $newStatus = [pscustomobject]@{
      id = 'status'; type = 'row'
      size = [pscustomobject]@{ px = 28 }
      children = @($status[0], $button)
    }
    $work[0].children = @($work[0].children | ForEach-Object {
      if ($_.id -eq 'status-original') { $newStatus } else { $_ }
    })
    $changed = $true
  } elseif ($status[0].type -eq 'row') {
    if (@($status[0].children | Where-Object { $_.id -eq $Mod }).Count -eq 0) {
      $status[0].children = @($status[0].children) + @(
        [pscustomobject]@{
          id = $Mod; type = 'block'
          size = [pscustomobject]@{ px = 32 }
          content = [pscustomobject]@{ mod = $Mod }
        }
      )
      $changed = $true
    }
  } else {
    throw "Unsupported status node type: $($status[0].type)"
  }
} else {
  $children = @($sidebar[0].children)
  if (@($children | Where-Object { $_.id -eq $Mod }).Count -eq 0) {
    $footer = @($children | Where-Object { $_.id -eq 'sidebar-footer' })
    if ($footer.Count -ne 1) { throw "Cannot find unique sidebar-footer; original preserved." }
    $newChildren = @()
    foreach ($child in $children) {
      if ($child.id -eq 'sidebar-footer') {
        $newChildren += [pscustomobject]@{
          id = $Mod; type = 'block'
          size = [pscustomobject]@{ px = 38 }
          content = [pscustomobject]@{ mod = $Mod }
        }
      }
      $newChildren += $child
    }
    $sidebar[0].children = $newChildren
    $changed = $true
  }
}
if ($changed) {
  $rendered = $data | ConvertTo-Json -Depth 100
  $null = $rendered | ConvertFrom-Json
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $backup = "$layoutDst.bak-$stamp-$([guid]::NewGuid().ToString('N'))"
  Copy-Item -LiteralPath $layoutDst -Destination $backup
  $temp = "$layoutDst.tmp-$PID"
  try {
    [System.IO.File]::WriteAllText($temp, $rendered + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temp -Destination $layoutDst -Force
  } finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
  }
  Write-Host "Backed up layout: $backup"
  Write-Host "Patched personal layout: $layoutDst"
} else {
  Write-Host "Layout already contains $Mod (no duplicate added)."
}
if ($Update -and (Test-Path -LiteralPath $dst)) {
  $backup = "$dst.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')-$([guid]::NewGuid().ToString('N'))"
  Move-Item -LiteralPath $dst -Destination $backup
  Write-Host "Backed up mod: $backup"
}
Copy-Item -LiteralPath $src -Destination $dst -Recurse
Write-Host "Installed mod: $dst"
Write-Host "Switch Herdr App to personal layout '$Layout' once; later mods add to it."
Write-Host "Optional CLI: herdr-app do layout.switch --name $Layout"
Write-Host "Validate: herdr-app check `"$dst`""
