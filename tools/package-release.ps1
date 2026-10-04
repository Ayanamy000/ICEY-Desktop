$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
& (Join-Path $PSScriptRoot 'build-launcher.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$distRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'dist'))
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $distRoot ('ICEY-Desktop-' + $package.version)))
if (-not $releaseRoot.StartsWith($distRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid release directory.' }
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\发行说明.md') -Destination (Join-Path $releaseRoot '使用说明.md')
# Package only the build output, never the project or the live user-data folder.
$forbidden = Get-ChildItem -LiteralPath $releaseRoot -File -Recurse -Force | Where-Object { $_.Name -match '^(state\.json|plugins\.json|\.env(?:\..*)?|memory\.sqlite(?:-.*)?|.*\.(?:db|sqlite|log))$' -or $_.FullName -match '\\(?:userData|verification|\.git|\.codex)\\' }
if ($forbidden) { throw 'Release contains unexpected user-data or development artifacts; archive was not created.' }
$archive = Join-Path $distRoot ('ICEY-Desktop-' + $package.version + '-clean.zip')
if (Test-Path -LiteralPath $archive) { throw 'Archive already exists; preserve or remove the previous archive before packaging again.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($releaseRoot, $archive, [IO.Compression.CompressionLevel]::Optimal, $true)
$stream = [IO.File]::OpenRead($archive)
$sha = [Security.Cryptography.SHA256]::Create()
try { $hash = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
finally { $stream.Dispose(); $sha.Dispose() }
[IO.File]::WriteAllText($archive + '.sha256', $hash + '  ' + [IO.Path]::GetFileName($archive) + [Environment]::NewLine, [Text.Encoding]::ASCII)
Write-Host ('Clean release archive: ' + $archive)
Write-Host ('SHA256: ' + $hash)
