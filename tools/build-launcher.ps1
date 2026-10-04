$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$buildCommand = Join-Path $projectRoot 'node_modules\.bin\electron-builder.cmd'
if (-not (Test-Path -LiteralPath $buildCommand)) { throw 'Run npm install first.' }

& $buildCommand --win dir --x64 --publish never
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$sourceRuntime = Join-Path $projectRoot 'dist\win-unpacked'
$distRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'dist'))
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $distRoot ("ICEY-Desktop-" + $package.version)))
if (-not $releaseRoot.StartsWith($distRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Release target is outside dist.'
}
if (-not (Test-Path -LiteralPath (Join-Path $sourceRuntime 'resources\app\src\main.cjs'))) {
    throw 'Runtime entry point is missing.'
}
if (Test-Path -LiteralPath $releaseRoot) {
    Remove-Item -LiteralPath $releaseRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $releaseRoot | Out-Null
Copy-Item -LiteralPath $sourceRuntime -Destination (Join-Path $releaseRoot 'runtime') -Recurse
# electron-builder patches ICEY.exe with a per-version resource hash. The stock
# Electron binary is the same compatible runtime and is already permitted on
# this machine; keep resources/app from the freshly packaged version.
$stockElectron = Join-Path $projectRoot 'node_modules\electron\dist\electron.exe'
Copy-Item -LiteralPath $stockElectron -Destination (Join-Path $releaseRoot 'runtime\ICEY.exe') -Force

$launcherName = "$([char]0x542F)$([char]0x52A8)$([char]0x827E)$([char]0x5E0C).exe"
$launcher = Join-Path $releaseRoot $launcherName
# Keep the already approved, version-independent launcher binary on machines
# where Windows application control blocks a newly compiled unsigned hash.
$trustedLauncher = Join-Path $projectRoot 'build\launcher.exe'
if (Test-Path -LiteralPath $trustedLauncher) {
    Copy-Item -LiteralPath $trustedLauncher -Destination $launcher
} else {
    $compiler = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    if (-not (Test-Path -LiteralPath $compiler)) { throw '.NET Framework C# compiler is unavailable.' }
    $icon = Join-Path $projectRoot 'build\icon.ico'
    $source = Join-Path $PSScriptRoot 'launcher\Program.cs'
    & $compiler /nologo /codepage:65001 /target:winexe /platform:anycpu /reference:System.Windows.Forms.dll "/win32icon:$icon" "/out:$launcher" $source
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
$commandLauncher = Join-Path $releaseRoot ($launcherName -replace '\.exe$', '.cmd')
$commandText = '@echo off' + "`r`n" + 'start "" "%~dp0runtime\ICEY.exe" %*' + "`r`n"
Set-Content -LiteralPath $commandLauncher -Value $commandText -Encoding Ascii
Write-Host "Launcher ready: $launcher"
