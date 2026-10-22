[CmdletBinding()]
param([string]$Destination)
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $Destination) { $Destination = Join-Path $sourceRoot 'dist' }
$destinationRoot = [IO.Path]::GetFullPath($Destination)
$version = (Get-Content -LiteralPath (Join-Path $sourceRoot 'package.json') -Raw | ConvertFrom-Json).version
$zipPath = Join-Path $destinationRoot "Kinetic-$version.zip"
if (Test-Path -LiteralPath $zipPath) { throw "Archive already exists: $zipPath. Choose a different Destination or move the existing archive." }
$stage = Join-Path $destinationRoot ('stage-' + [Guid]::NewGuid().ToString('N'))
$bundle = Join-Path $stage 'Kinetic'
New-Item -ItemType Directory -Path $bundle -Force | Out-Null
$items = @('CSXS','css','js','jsx','docs','scripts','tests','index.html','install-windows.ps1','Install Windows.cmd','install-macos.command','package.json','README.md','LICENSE','CHANGELOG.md','VALIDATION.md')
foreach ($item in $items) {
  $itemPath = Join-Path $sourceRoot $item
  if (-not (Test-Path -LiteralPath $itemPath)) { throw "Missing required release content: $item" }
  Copy-Item -LiteralPath $itemPath -Destination $bundle -Recurse
}
Compress-Archive -LiteralPath $bundle -DestinationPath $zipPath -CompressionLevel Optimal
$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
($hash + '  ' + [IO.Path]::GetFileName($zipPath)) | Set-Content -LiteralPath (Join-Path $destinationRoot "Kinetic-$version.sha256") -Encoding utf8
# Keep the named staging directory as an inspectable extracted copy. Never recursively delete arbitrary caller paths.
Write-Output "Created $zipPath"
Write-Output "Extracted copy: $bundle"
Write-Output "SHA256 $hash"
