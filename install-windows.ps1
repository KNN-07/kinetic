[CmdletBinding(SupportsShouldProcess)]
param()
$ErrorActionPreference = 'Stop'
$source = $PSScriptRoot
$extensionRoot = [IO.Path]::GetFullPath((Join-Path $env:APPDATA 'Adobe\CEP\extensions'))
$destination = [IO.Path]::GetFullPath((Join-Path $extensionRoot 'com.kinetic.panel'))
if ((Split-Path -Parent $destination) -ne $extensionRoot) { throw 'Invalid installation path.' }
$required = @('CSXS\manifest.xml', 'index.html', 'js\bridge.js', 'js\core.js', 'js\panel.js', 'css\panel.css', 'jsx\kinetic.jsx')
foreach ($item in $required) { if (-not (Test-Path -LiteralPath (Join-Path $source $item) -PathType Leaf)) { throw "Missing $item. Extract the complete Kinetic ZIP first." } }
if (Test-Path -LiteralPath $destination) { throw "Kinetic is already present at $destination. Close After Effects and move that exact folder elsewhere as a backup before installing." }
if ($PSCmdlet.ShouldProcess($destination, 'Install Kinetic and enable unsigned CEP 12 extensions for the current user')) {
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
  foreach ($item in @('CSXS','css','js','jsx','index.html')) { Copy-Item -LiteralPath (Join-Path $source $item) -Destination $destination -Recurse }
  $registryPath = 'HKCU:\Software\Adobe\CSXS.12'
  New-Item -Path $registryPath -Force | Out-Null
  New-ItemProperty -Path $registryPath -Name PlayerDebugMode -Value '1' -PropertyType String -Force | Out-Null
  Write-Host "Installed Kinetic to $destination"
  Write-Host 'Enabled CEP 12 developer mode for this user (unsigned extensions). No admin rights needed.'
  Write-Host 'Restart After Effects 2025/2026, then open Window > Extensions > Kinetic.'
}
