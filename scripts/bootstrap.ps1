# One-line installer: fetch archive, run local PowerShell installer, clean up.
$ErrorActionPreference = 'Stop'
$url = 'https://github.com/hheei/herdr-mods/archive/refs/heads/main.zip'
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("herdr-mods-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
try {
  $zip = Join-Path $tmp 'source.zip'
  Invoke-WebRequest -Uri $url -OutFile $zip
  Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $tmp 'extracted')
  $installer = Join-Path $tmp 'extracted/herdr-mods-main/scripts/install.ps1'
  if (!(Test-Path -LiteralPath $installer)) { throw "Unexpected source archive" }
  & $installer -Mod project-open -Update
} finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
