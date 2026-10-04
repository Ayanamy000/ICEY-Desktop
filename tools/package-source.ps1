$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$distRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'dist'))
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$archive = [IO.Path]::GetFullPath((Join-Path $distRoot ("ICEY-Desktop-$version-source.zip")))
if (-not $archive.StartsWith($distRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid source archive path.' }
if (Test-Path -LiteralPath $archive) { throw 'Source archive already exists; preserve or remove it before packaging again.' }
$stage = [IO.Path]::GetFullPath((Join-Path $distRoot ('source-stage-' + [Guid]::NewGuid().ToString('N'))))
if (-not $stage.StartsWith($distRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid staging path.' }
New-Item -ItemType Directory -Path $stage -Force | Out-Null
try {
    foreach ($relative in @('.gitignore', 'README.md', 'package.json', 'package-lock.json', '启动艾希.cmd')) {
        Copy-Item -LiteralPath (Join-Path $projectRoot $relative) -Destination (Join-Path $stage $relative)
    }
    foreach ($relative in @('docs', 'tests', 'tools', 'src\services', 'src\renderer', 'src\prompts', 'src\extensions', 'src\assets')) {
        $destination = Join-Path $stage $relative
        New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $projectRoot $relative) -Destination $destination -Recurse
    }
    foreach ($relative in @('src\main.cjs', 'src\preload.cjs')) {
        Copy-Item -LiteralPath (Join-Path $projectRoot $relative) -Destination (Join-Path $stage $relative)
    }
    New-Item -ItemType Directory -Path (Join-Path $stage 'build') -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $projectRoot 'build\icon.ico') -Destination (Join-Path $stage 'build\icon.ico')
    # The launcher binary is generated from tools/launcher/Program.cs; do not upload it as source.
    $forbidden = Get-ChildItem -LiteralPath $stage -File -Recurse -Force | Where-Object {
        $_.Name -match '^(state\.json|plugins\.json|\.env(?:\..*)?|memory\.sqlite(?:-.*)?|.*\.(?:db|sqlite|log))$' -or
        $_.FullName.Substring($stage.Length + 1) -match '^(?:node_modules|dist|verification|\.git|\.codex)\\|\\(?:node_modules|dist|verification|\.git|\.codex)\\'
    }
    if ($forbidden) { throw 'Unexpected personal data or generated content in source staging.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    Add-Type -AssemblyName System.IO.Compression
    $archiveStream = [IO.File]::Create($archive)
    $zip = New-Object IO.Compression.ZipArchive($archiveStream, [IO.Compression.ZipArchiveMode]::Create, $false)
    try {
        foreach ($file in Get-ChildItem -LiteralPath $stage -Recurse -File -Force) {
            $entryName = $file.FullName.Substring($stage.Length + 1).Replace('\', '/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $entryName, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally { $zip.Dispose(); $archiveStream.Dispose() }
    $stream = [IO.File]::OpenRead($archive)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $sha.Dispose() }
    [IO.File]::WriteAllText($archive + '.sha256', $hash + '  ' + [IO.Path]::GetFileName($archive) + [Environment]::NewLine, [Text.Encoding]::ASCII)
    Write-Host ('GitHub source archive: ' + $archive)
    Write-Host ('SHA256: ' + $hash)
} finally {
    $resolved = [IO.Path]::GetFullPath($stage)
    if ($resolved.StartsWith($distRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolved)) {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
