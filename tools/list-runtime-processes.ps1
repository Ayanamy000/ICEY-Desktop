param([Parameter(Mandatory = $true)][string]$RuntimePath)
$resolved = [IO.Path]::GetFullPath($RuntimePath)
$ids = @(Get-Process -Name ICEY -ErrorAction SilentlyContinue | Where-Object {
    try { $_.Path -eq $resolved } catch { $false }
} | Select-Object -ExpandProperty Id)
ConvertTo-Json -InputObject $ids -Compress
