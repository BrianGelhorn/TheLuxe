#Requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory=$true)][Alias('Home')][string]$InstallHome, [Parameter(Mandatory=$true)][string]$Node, [Parameter(Mandatory=$true)][string]$Git)

$ErrorActionPreference = 'Stop'
$InstallHome = [IO.Path]::GetFullPath($InstallHome)
$repo = Join-Path $InstallHome 'repo'
$hostScript = Join-Path $repo 'native-host.mjs'
$logs = Join-Path $InstallHome 'logs'
if (-not (Test-Path -LiteralPath $hostScript)) { throw 'Falta native-host.mjs; la tarea no iniciara una version incompleta.' }
if (-not (Test-Path -LiteralPath $Node) -or -not (Test-Path -LiteralPath $Git)) { throw 'Node o Git de Program Files no esta disponible.' }
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$current = Join-Path $logs 'native-current.log'; $previous = Join-Path $logs 'native-previous.log'
if (Test-Path -LiteralPath $current) { Move-Item -LiteralPath $current -Destination $previous -Force }
$env:THELUXE_GIT = $Git
$ErrorActionPreference = 'Continue' # stderr de Node es diagnostico; el codigo de salida decide el fallo.
& $Node $hostScript --home $InstallHome --repo $repo *>> $current
exit $LASTEXITCODE
