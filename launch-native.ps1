#Requires -Version 5.1
[CmdletBinding()]
param([string]$InstallHome = (Join-Path $env:ProgramData 'TheLuxeNative'))

$ErrorActionPreference = 'Stop'

function Find-NativeChrome {
    foreach ($path in @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")) {
        if (Test-Path -LiteralPath $path -PathType Leaf) { return $path }
    }
    throw 'No se encontro Google Chrome. Instalalo y vuelve a abrir TheLuxe.'
}

function Test-NativeReady {
    param([string]$Commit)
    try {
        $version = Invoke-RestMethod 'http://127.0.0.1:8000/version.json' -TimeoutSec 2
        $health = Invoke-RestMethod 'http://127.0.0.1:8000/api/health' -TimeoutSec 2
        $updater = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8001/status' -Method Options -Headers @{ Origin = 'http://127.0.0.1:8000' } -TimeoutSec 2
        return $version.commit -eq $Commit -and $version.version -match '^[a-f0-9]{64}$' -and $health.ok -eq $true -and $updater.StatusCode -eq 204 -and $updater.Headers['Access-Control-Allow-Origin'] -eq 'http://127.0.0.1:8000'
    } catch { return $false }
}

function Start-NativeManualProcess {
    param([string]$Node, [string]$Repo, [string]$HomePath)
    # Consola propia, sin LocalService ni la redireccion de PowerShell. No cerrar mientras se usa.
    $arguments = '"{0}" --home "{1}" --repo "{2}"' -f (Join-Path $Repo 'native-host.mjs'), $HomePath, $Repo
    Start-Process -FilePath $Node -ArgumentList $arguments -WorkingDirectory $Repo -PassThru
}

function Open-NativeChrome {
    param([string]$Chrome)
    Start-Process -FilePath $Chrome -ArgumentList @('--new-window', 'http://127.0.0.1:8000/')
}

function Start-TheLuxeManual {
    $path = [IO.Path]::GetFullPath($InstallHome).TrimEnd('\')
    $marker = Get-Content -LiteralPath (Join-Path $path '.theluxe-native.json') -Raw | ConvertFrom-Json
    if ($marker.type -ne 'Native' -or $marker.origin -ne 'https://github.com/BrianGelhorn/TheLuxe.git' -or [IO.Path]::GetFullPath([string]$marker.installPath).TrimEnd('\') -ne $path) { throw 'La carpeta no corresponde a una instalacion de TheLuxe.' }
    if ($marker.ownerSid -and $marker.ownerSid -ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value) { throw 'Abri TheLuxe con el usuario al que se asigno la instalacion.' }
    $active = Get-Content -LiteralPath (Join-Path $path 'data\active.json') -Raw | ConvertFrom-Json
    if ($active.commit -notmatch '^[a-f0-9]{40}$') { throw 'La version activa no es valida. No se modificaron datos.' }
    $repo = Join-Path $path 'repo'
    $node = "$env:ProgramFiles\nodejs\node.exe"
    $git = "$env:ProgramFiles\Git\cmd\git.exe"
    if (-not (Test-Path -LiteralPath (Join-Path $repo 'native-host.mjs')) -or -not (Test-Path -LiteralPath $node) -or -not (Test-Path -LiteralPath $git)) { throw 'Falta el runtime, Node o Git. Reejecuta el instalador.' }
    $chrome = Find-NativeChrome
    $mutex = New-Object Threading.Mutex($false, 'Local\TheLuxeNativeManualLauncher')
    $locked = $false
    try {
        $locked = $mutex.WaitOne(0)
        if (-not $locked) { throw 'TheLuxe ya se esta iniciando. Espera y vuelve a abrir el acceso directo.' }
        if (-not (Test-NativeReady $active.commit)) {
            if (Get-NetTCPConnection -State Listen -LocalPort 8000,8001 -ErrorAction SilentlyContinue) { throw 'Los puertos estan ocupados y la app completa no responde. Cierra con Ctrl+C la instancia manual anterior; no se mataron procesos.' }
            $env:THELUXE_GIT = $git
            $process = Start-NativeManualProcess $node $repo $path
            $deadline = (Get-Date).AddSeconds(60)
            $ready = $false
            do {
                if (Test-NativeReady $active.commit) { $ready = $true; break }
                $process.Refresh()
                if ($process.HasExited) { throw "TheLuxe termino al iniciar (codigo $($process.ExitCode)). Revisa la consola de ejecucion." }
                Start-Sleep -Seconds 1
            } while ((Get-Date) -lt $deadline)
            if (-not $ready) { throw 'La web, API y actualizador no respondieron a tiempo. Revisa la consola de TheLuxe; Chrome no se abrio.' }
        }
        Open-NativeChrome $chrome
        'TheLuxe listo. Mantene abierta la consola de Node para operaciones, backups y actualizaciones.'
    } finally {
        if ($locked) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}

if ($MyInvocation.InvocationName -ne '.') { Start-TheLuxeManual }
