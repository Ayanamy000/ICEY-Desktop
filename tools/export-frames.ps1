$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$verify = Join-Path $taskRoot 'verification'
$sources = @(Get-ChildItem -LiteralPath "$verify\tools\spine-runtimes\spine-csharp\src" -Filter '*.cs' -Recurse | ForEach-Object FullName)
Add-Type -Path ($sources + "$verify\Probe.cs")
$animations = @()
foreach ($spec in @(@{model='NewPlayerNormal';names=@('Idle','Run')}, @{model='NewPlayerAtk';names=@('Atk1','Atk2','Atk3')})) {
    $probe = [Probe]::new("$verify\assets", $spec.model)
    foreach ($name in $spec.names) {
        $animation = $probe.data.FindAnimation($name)
        if ($null -eq $animation) { throw "Missing animation: $name" }
        $frames = @()
        $frameCount = [Math]::Max(12, [Math]::Ceiling($animation.Duration*30))
        for ($i=0; $i -lt $frameCount; $i++) {
            $frames += ,@($probe.Frame($name, $animation.Duration*$i/$frameCount))
        }
        $animations += @{name=$name;texture=$spec.model+'.png';duration=$animation.Duration;frames=$frames}
    }
}
ConvertTo-Json -InputObject @($animations) -Depth 12 -Compress | Set-Content -LiteralPath "$verify\project-frames.json" -Encoding utf8
Write-Output 'Exported Idle, Run, Atk1, Atk2, Atk3'
