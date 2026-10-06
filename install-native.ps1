#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$InstallPath = (Join-Path $env:ProgramData 'TheLuxeNative'),
    [string]$DatabaseBackupPath,
    [string]$OwnerSid = ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value)
)

$ErrorActionPreference = 'Stop'
$script:NativeTaskName = 'TheLuxe Native'
$script:NativeOrigin = 'https://github.com/BrianGelhorn/TheLuxe.git'
$script:LocalServiceSid = 'S-1-5-19'

function Invoke-Checked { param([string]$Program, [string[]]$Arguments) & $Program @Arguments; if ($LASTEXITCODE -ne 0) { throw "$Program fallo (codigo $LASTEXITCODE)." } }
function Find-MachineTool { param([string]$Path) if (Test-Path -LiteralPath $Path) { $Path } }
function Test-IsAdministrator { $i = [Security.Principal.WindowsIdentity]::GetCurrent(); (New-Object Security.Principal.WindowsPrincipal($i)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }
function Get-NativeMarkerPath { param([string]$InstallHome) Join-Path $InstallHome '.theluxe-native.json' }
function Get-NativeMarker { param([string]$InstallHome) $p = Get-NativeMarkerPath $InstallHome; if (Test-Path -LiteralPath $p) { try { Get-Content -LiteralPath $p -Raw | ConvertFrom-Json } catch { throw 'El marcador de instalacion nativa no es valido. No se modifico.' } } }
function Assert-LocalDirectory { param([string]$Path) if (Test-Path -LiteralPath $Path) { $i = Get-Item -LiteralPath $Path -Force; if (-not $i.PSIsContainer -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'La ruta de instalacion no puede ser un enlace, junction ni archivo.' } } }
function Assert-NativeHome {
    param([string]$InstallHome, [switch]$Existing)
    if (-not (Test-Path -LiteralPath $InstallHome)) { if ($Existing) { throw 'No existe la instalacion nativa.' }; return }
    $m = Get-NativeMarker $InstallHome
    if (-not $m -or $m.type -ne 'Native' -or $m.origin -ne $script:NativeOrigin -or [IO.Path]::GetFullPath([string]$m.installPath) -ne $InstallHome) { throw 'La carpeta de destino no pertenece a TheLuxe Native. No se adopto ni modifico.' }
}
function Assert-OwnerSid {
    param([string]$Sid)
    if ($Sid -notmatch '^S-1-(?:5-21|12-1)-\d+(?:-\d+){2,}$') { throw 'OwnerSid debe ser el SID de un usuario Windows, no un grupo.' }
    try { $name = ([Security.Principal.SecurityIdentifier]$Sid).Translate([Security.Principal.NTAccount]).Value } catch { throw 'OwnerSid no resuelve a un usuario Windows.' }
    if ($name -match '^(Everyone|BUILTIN\\Users|NT AUTHORITY\\(LOCAL SERVICE|SYSTEM))$') { throw 'OwnerSid debe identificar a un usuario, no un grupo o cuenta de servicio.' }
    $Sid
}
function Write-NativeMarker { param([string]$InstallHome, [string]$Sid) @{ type='Native'; installPath=$InstallHome; origin=$script:NativeOrigin; ownerSid=$Sid } | ConvertTo-Json | Set-Content -LiteralPath (Get-NativeMarkerPath $InstallHome) -Encoding UTF8 }
function Invoke-NativeGit { param([string]$Git,[string]$Repo,[string[]]$Arguments) Invoke-Checked $Git (@('-c', "safe.directory=$Repo", '-C', $Repo) + $Arguments) }
function Assert-CleanNativeRepository {
    param([string]$InstallHome, [string]$Git)
    $repo = Join-Path $InstallHome 'repo'
    if (-not (Test-Path -LiteralPath (Join-Path $repo '.git'))) { throw 'Falta el repositorio nativo administrado.' }
    if ((Invoke-NativeGit $Git $repo @('branch','--show-current')) -ne 'main' -or (Invoke-NativeGit $Git $repo @('remote','get-url','origin')) -notmatch '^https://github\.com/BrianGelhorn/TheLuxe(?:\.git)?$' -or (Invoke-NativeGit $Git $repo @('status','--porcelain'))) { throw 'El repositorio nativo debe ser main limpio con el origen oficial. No se modifico.' }
}
function Assert-NativeFiles { param([string]$Repo) foreach ($f in 'native-host.mjs','native-deployment.mjs','launch-native.ps1','TheLuxe.bat') { if (-not (Test-Path -LiteralPath (Join-Path $Repo $f))) { throw "La version descargada aun no publica $f." } } }
function Test-TaskUser { param([string]$UserId,[string]$Sid) if ($UserId -eq $Sid) { return $true }; try { ([Security.Principal.NTAccount]$UserId).Translate([Security.Principal.SecurityIdentifier]).Value -eq $Sid } catch { $false } }
function Test-NativeTask {
    param($Task,[string]$InstallHome,[string]$Node,[string]$Git)
    if (-not $Task) { return $false }
    $runner = Join-Path $InstallHome 'start-native.ps1'
    $args = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File `"$runner`" -Home `"$InstallHome`" -Node `"$Node`" -Git `"$Git`""
    $Task.Actions.Count -eq 1 -and $Task.Actions[0].Execute -eq "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -and $Task.Actions[0].Arguments -eq $args -and $Task.Actions[0].WorkingDirectory -eq $InstallHome -and (Test-TaskUser $Task.Principal.UserId $script:LocalServiceSid) -and [string]$Task.Principal.LogonType -eq 'ServiceAccount'
}
function Assert-TaskIsOurs { param($Task,[string]$InstallHome,[string]$Node,[string]$Git) if ($Task -and -not (Test-NativeTask $Task $InstallHome $Node $Git)) { throw 'La tarea TheLuxe Native pertenece a otra configuracion. No se reemplazo.' } }
function Remove-LegacyNativeTask {
    param($Task, [string]$InstallHome, [string]$Node, [string]$Git)
    if (-not $Task) { return }
    Assert-TaskIsOurs $Task $InstallHome $Node $Git
    if ($Task.State -eq 'Running') { Stop-ScheduledTask -TaskName $script:NativeTaskName -ErrorAction Stop }
    Unregister-ScheduledTask -TaskName $script:NativeTaskName -Confirm:$false
}
function Get-ChromeNative {
    $paths = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")
    foreach ($p in $paths) { if ($p -and (Test-Path -LiteralPath $p)) { return $p } }
}
function Assert-NativePortsClear { if (@(Get-NetTCPConnection -State Listen -LocalPort 8000,8001 -ErrorAction SilentlyContinue).Count) { throw 'Cierra la instancia anterior con Ctrl+C antes de convertir o actualizar; no se detuvieron procesos.' } }
function New-NativeShortcut {
    param([string]$InstallHome,[string]$Sid)
    $desktop = [Environment]::GetFolderPath('CommonDesktopDirectory'); $path = Join-Path $desktop 'TheLuxe Native.lnk'; $target = Join-Path $InstallHome 'TheLuxe.bat'
    if (Test-Path -LiteralPath $path) { $old = (New-Object -ComObject WScript.Shell).CreateShortcut($path); if ($old.TargetPath -ne $target) { throw 'El acceso directo TheLuxe Native.lnk ya existe con otro destino.' }; return }
    $link = (New-Object -ComObject WScript.Shell).CreateShortcut($path); $link.TargetPath = $target; $link.WorkingDirectory = $InstallHome; $link.Save()
    $oldUrl = Join-Path $desktop 'TheLuxe Native.url'
    if ((Test-Path -LiteralPath $oldUrl) -and ([IO.File]::ReadAllText($oldUrl) -match '(?m)^URL=http://127\.0\.0\.1:8000/\r?$')) { Remove-Item -LiteralPath $oldUrl }
}
function Set-NativeAcl {
    param([string]$InstallHome,[string]$Sid)
    Invoke-Checked 'icacls.exe' @($InstallHome,'/inheritance:r','/remove:g','*S-1-1-0','*S-1-5-32-545','*S-1-5-19','/grant:r','*S-1-5-32-544:(OI)(CI)F','*S-1-5-18:(OI)(CI)F',"*$Sid`:(OI)(CI)RX")
    foreach ($name in 'repo','releases','data','logs') { $p=Join-Path $InstallHome $name; if (Test-Path -LiteralPath $p) { Invoke-Checked 'icacls.exe' @($p,'/remove:g','*S-1-5-19','/grant:r','*S-1-5-32-544:(OI)(CI)F','*S-1-5-18:(OI)(CI)F',"*$Sid`:(OI)(CI)M") } }
}
function Read-ActiveCommit { param([string]$Node,[string]$InstallHome) $p=Join-Path $InstallHome 'data\active.json'; if (-not(Test-Path -LiteralPath $p)) { return }; $code="const x=require('fs').readFileSync(process.argv[1],'utf8');const c=JSON.parse(x).commit;if(!/^[a-f0-9]{40}$/.test(c))process.exit(2);process.stdout.write(c)"; (Invoke-Checked $Node @('-e',$code,$p)).Trim() }
function Assert-PreparedActive { param([string]$Node,[string]$InstallHome) $c=Read-ActiveCommit $Node $InstallHome; if (-not $c -or -not(Test-Path -LiteralPath (Join-Path $InstallHome "releases\$c\dist\client\version.json"))) { throw 'No hay una version activa preparada.' }; $c }
function Invoke-ReviewedElevatedInstaller {
    param([string]$Path,[string]$BackupPath,[string]$Sid)
    $dir=Join-Path $env:TEMP ('theluxe-native-'+[guid]::NewGuid()); New-Item -ItemType Directory -Path $dir -Force|Out-Null; $temp=Join-Path $dir 'install-native.ps1'; Copy-Item -LiteralPath $PSCommandPath -Destination $temp -Force
    $t=$null;$e=$null;[Management.Automation.Language.Parser]::ParseFile($temp,[ref]$t,[ref]$e)|Out-Null;if($e.Count){throw 'La copia temporal no pudo analizarse.'}
    $a=@('-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',('"{0}"'-f $temp),'-InstallPath',('"{0}"'-f $Path),'-OwnerSid',('"{0}"'-f $Sid));if($BackupPath){$a+=@('-DatabaseBackupPath',('"{0}"'-f $BackupPath))};$p=Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Verb RunAs -Wait -PassThru -ArgumentList $a;Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue;if($p.ExitCode -ne 0){throw "La elevacion UAC no completo la instalacion (codigo $($p.ExitCode))."}
}
function Install-TheLuxeNative {
    $installHome = [IO.Path]::GetFullPath($InstallPath).TrimEnd('\')
    $sid = Assert-OwnerSid $OwnerSid
    Assert-LocalDirectory $installHome
    $exists = Test-Path -LiteralPath $installHome
    if ($exists) {
        Assert-NativeHome $installHome -Existing
        $marker = Get-NativeMarker $installHome
        if ($marker.ownerSid) { $sid = Assert-OwnerSid $marker.ownerSid }
        if ($DatabaseBackupPath) { throw 'La importacion solo se permite en una primera instalacion.' }
    }
    $expectedNode = "$env:ProgramFiles\nodejs\node.exe"
    $expectedGit = "$env:ProgramFiles\Git\cmd\git.exe"
    $legacy = Get-ScheduledTask -TaskName $script:NativeTaskName -ErrorAction SilentlyContinue
    Assert-TaskIsOurs $legacy $installHome $expectedNode $expectedGit
    $os = Get-CimInstance Win32_OperatingSystem
    if ($os.ProductType -ne 1 -or [int]$os.BuildNumber -lt 19045 -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'Requiere Windows cliente x64 compatible con Node 24; no admite Server ni ARM.' }
    if ([int]$os.BuildNumber -eq 19045) { Write-Warning 'Comproba la cobertura de seguridad/ESU de Windows 10.' }
    $git = Find-MachineTool $expectedGit; $node = Find-MachineTool $expectedNode
    if (-not $git -or -not $node -or -not (Get-ChromeNative)) {
        $winget = Get-Command winget.exe -CommandType Application -ErrorAction SilentlyContinue
        if (-not $winget) { throw 'Falta Git, Node o Chrome. Instalalos o instala App Installer (winget) y repeti.' }
        if (-not $git) { Invoke-Checked $winget.Source @('install','--id','Git.Git','--exact','--scope','machine','--interactive') }
        if (-not $node) { Invoke-Checked $winget.Source @('install','--id','OpenJS.NodeJS.LTS','--exact','--scope','machine','--interactive') }
        if (-not (Get-ChromeNative)) { Invoke-Checked $winget.Source @('install','--id','Google.Chrome','--exact','--scope','machine','--interactive') }
        $git = Find-MachineTool $expectedGit; $node = Find-MachineTool $expectedNode
    }
    if (-not $git -or -not $node -or -not (Get-ChromeNative)) { throw 'Git y Node deben estar en Program Files y Chrome debe estar instalado.' }
    $version = Invoke-Checked $node @('--version')
    if ($version -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 24) { throw 'Node 24 o superior es obligatorio.' }
    if ($exists -and (Test-Path -LiteralPath (Join-Path $installHome 'repo'))) { Assert-CleanNativeRepository $installHome $git }
    # Conversion de la tarea propia, sin matar otras instancias manuales ni borrar datos.
    Remove-LegacyNativeTask $legacy $installHome $node $git
    for ($i = 0; $i -lt 10; $i++) {
        if (-not @(Get-NetTCPConnection -State Listen -LocalPort 8000,8001 -ErrorAction SilentlyContinue).Count) { break }
        Start-Sleep -Milliseconds 500
    }
    Assert-NativePortsClear
    if (-not $exists) { New-Item -ItemType Directory -Path $installHome | Out-Null; Write-NativeMarker $installHome $sid; Set-NativeAcl $installHome $sid }
    foreach ($dir in 'releases','data','logs','data\backups') { $path = Join-Path $installHome $dir; Assert-LocalDirectory $path; New-Item -ItemType Directory -Path $path -Force | Out-Null }
    $repo = Join-Path $installHome 'repo'
    if (Test-Path -LiteralPath $repo) {
        Assert-LocalDirectory $repo; Assert-CleanNativeRepository $installHome $git
        Invoke-NativeGit $git $repo @('fetch','origin','main')
        Invoke-NativeGit $git $repo @('merge','--ff-only','origin/main')
    } else { Invoke-Checked $git @('clone','--branch','main','--single-branch',$script:NativeOrigin,$repo) }
    Assert-NativeFiles $repo
    foreach ($file in 'launch-native.ps1','TheLuxe.bat') { Copy-Item -LiteralPath (Join-Path $repo $file) -Destination (Join-Path $installHome $file) -Force }
    $active = Read-ActiveCommit $node $installHome
    if ($DatabaseBackupPath -and -not $active) { Invoke-Checked $node @((Join-Path $repo 'native-deployment.mjs'),'import',$installHome,([IO.Path]::GetFullPath($DatabaseBackupPath))) }
    if (-not $active) { $commit = (Invoke-NativeGit $git $repo @('rev-parse','HEAD')).Trim(); Invoke-Checked $node @((Join-Path $repo 'native-deployment.mjs'),'prepare',$installHome,$repo,$commit) }
    Assert-PreparedActive $node $installHome | Out-Null
    Write-NativeMarker $installHome $sid
    Set-NativeAcl $installHome $sid
    New-NativeShortcut $installHome $sid
    "TheLuxe Native listo. Doble clic en TheLuxe.bat; manten la consola abierta mientras uses TheLuxe. No se creo inicio automatico ni servicio."
}
if($MyInvocation.InvocationName -ne '.') { if(-not(Test-IsAdministrator)){Invoke-ReviewedElevatedInstaller $InstallPath $DatabaseBackupPath $OwnerSid}else{Install-TheLuxeNative} }
