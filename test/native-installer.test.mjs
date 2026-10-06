import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const installer = join(root, 'install-native.ps1');
const windows = { skip: process.platform !== 'win32' };
const q = value => `'${value.replaceAll("'", "''")}'`;
const ps = script => {
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 20_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
};

test('NATIVE-001 - installer parses and never contains autostart registration', windows, () => {
  ps(`$t=$null;$e=$null;[Management.Automation.Language.Parser]::ParseFile(${q(installer)},[ref]$t,[ref]$e)|Out-Null;if($e.Count){throw($e|Out-String)};$s=[IO.File]::ReadAllText(${q(installer)});if($s-match '(?<!Un)Register-ScheduledTask|New-ScheduledTaskTrigger|Start-ScheduledTask'){throw 'autostart left behind'}`);
});

test('NATIVE-002 - foreign legacy task is refused before installer work', windows, () => {
  ps(String.raw`. ${q(installer)}; $task=[pscustomobject]@{Actions=@([pscustomobject]@{Execute='other';Arguments='';WorkingDirectory=''});Principal=[pscustomobject]@{UserId='x';LogonType='Interactive'};State='Ready'};$bad=$false;try{Assert-TaskIsOurs $task 'C:\x' 'node' 'git'}catch{$bad=$true};if(-not $bad){throw 'foreign task accepted'}`);
});

test('NATIVE-003 - only a validated legacy task is stopped and unregistered', windows, () => {
  ps(String.raw`. ${q(installer)}; $script:stopped=0;$script:removed=0; function Stop-ScheduledTask {$script:stopped++}; function Unregister-ScheduledTask {$script:removed++}; $h='C:\ProgramData\TheLuxeNative'; $n='C:\Program Files\nodejs\node.exe'; $g='C:\Program Files\Git\cmd\git.exe'; $a='-NoLogo -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "{0}\start-native.ps1" -Home "{0}" -Node "{1}" -Git "{2}"' -f $h,$n,$g; $task=[pscustomobject]@{Actions=@([pscustomobject]@{Execute="$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe";Arguments=$a;WorkingDirectory=$h}); Principal=[pscustomobject]@{UserId='S-1-5-19';LogonType='ServiceAccount'};State='Running'}; Remove-LegacyNativeTask $task $h $n $g; if($script:stopped-ne 1 -or $script:removed-ne 1){throw 'legacy task not removed'}; $task.Actions[0].Execute='other.exe'; $failed=$false; try { Remove-LegacyNativeTask $task $h $n $g } catch { $failed=$true }; if(-not $failed -or $script:removed-ne 1){throw 'removed foreign task'}`);
});

test('NATIVE-004 - OwnerSid is forwarded through UAC and Chrome lookup is local', windows, () => {
  ps(String.raw`. ${q(installer)}; $env:TEMP=[IO.Path]::GetTempPath();$script:a=$null;function Start-Process{param($ArgumentList)$script:a=$ArgumentList;[pscustomobject]@{ExitCode=0}};Invoke-ReviewedElevatedInstaller 'C:\x' $null 'S-1-5-21-1-2-3-4';if(($script:a-join ' ')-notmatch 'OwnerSid.*S-1-5-21-1-2-3-4'){throw 'OwnerSid lost'};$s=[IO.File]::ReadAllText(${q(installer)});if($s-notmatch 'Google\\Chrome\\Application\\chrome.exe' -or $s-notmatch 'TheLuxe Native.lnk'){throw 'Chrome or shortcut missing'}`);
});

test('NATIVE-005 - instalacion manual completa y repetida conserva la base y la version activa', windows, async t => {
  const parent = await mkdtemp(join(tmpdir(), 'theluxe-manual-install-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const home = join(parent, 'install');
  const code = String.raw`. ${q(installer)} -InstallPath ${q(home)};
    function Find-MachineTool { param($Path); return $Path }
    function Get-ChromeNative { return 'chrome.exe' }
    function Get-CimInstance { return [pscustomobject]@{ProductType=1;BuildNumber=22631} }
    function Get-ScheduledTask { return $null }
    function Get-NetTCPConnection { return }
    function Set-NativeAcl { param($InstallHome,$Sid); $script:aclSid=$Sid }
    function New-NativeShortcut { param($InstallHome,$Sid); if(-not(Test-Path -LiteralPath (Join-Path $InstallHome 'TheLuxe.bat'))){throw 'missing BAT'} }
    $script:prepared=0; $script:cloned=0;
    function Invoke-Checked { param($Program,$Arguments);
      if($Arguments -contains '--version'){ return 'v24.21.0' }
      if($Arguments -contains 'clone'){
        $script:cloned++; $r=$Arguments[-1]; New-Item -ItemType Directory -Path (Join-Path $r '.git') -Force|Out-Null;
        foreach($name in @('native-host.mjs','native-deployment.mjs','launch-native.ps1','TheLuxe.bat')){[IO.File]::WriteAllText((Join-Path $r $name),'fixture')}; return
      }
      if($Arguments -contains '--show-current'){return 'main'}
      if($Arguments -contains 'get-url'){return 'https://github.com/BrianGelhorn/TheLuxe.git'}
      if($Arguments -contains '--porcelain'){return}
      if($Arguments -contains 'rev-parse'){return ('a'*40)}
      if($Arguments -contains 'prepare'){
        $script:prepared++; $h=$Arguments[2]; $v=Join-Path $h ('releases\'+('a'*40)+'\dist\client'); New-Item -ItemType Directory -Path $v -Force|Out-Null;
        [IO.File]::WriteAllText((Join-Path $h 'data\active.json'),('{'+'"commit":"'+('a'*40)+'"}'));
        [IO.File]::WriteAllText((Join-Path $v 'version.json'),('{'+'"commit":"'+('a'*40)+'"}')); return
      }
      if($Arguments[0]-eq '-e'){return ('a'*40)}
    }
    Install-TheLuxeNative;
    [IO.File]::WriteAllText((Join-Path ${q(home)} 'data\theluxe.sqlite'),'keep-database');
    Install-TheLuxeNative;
    if($script:prepared-ne 1 -or $script:cloned-ne 1){throw 'reinitialized installation'};
    if($script:aclSid-ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value){throw 'wrong owner permissions'};
    if([IO.File]::ReadAllText((Join-Path ${q(home)} 'data\theluxe.sqlite'))-ne 'keep-database'){throw 'database altered'};`;
  ps(code);
  assert.equal(await readFile(join(home, 'data', 'theluxe.sqlite'), 'utf8'), 'keep-database');
});
