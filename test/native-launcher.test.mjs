import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const launcher = join(root, 'launch-native.ps1');
const windows = { skip: process.platform !== 'win32' };
const q = value => `'${value.replaceAll("'", "''")}'`;
function ps(code) {
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', code], { encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
}
async function fixture(t) {
  const path = await mkdtemp(join(tmpdir(), 'theluxe-manual-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  await mkdir(join(path, 'repo')); await mkdir(join(path, 'data'));
  await writeFile(join(path, '.theluxe-native.json'), JSON.stringify({ type: 'Native', origin: 'https://github.com/BrianGelhorn/TheLuxe.git', installPath: path }));
  await writeFile(join(path, 'data', 'active.json'), JSON.stringify({ commit: 'a'.repeat(40) }));
  await writeFile(join(path, 'repo', 'native-host.mjs'), '// runtime fixture');
  return `. ${q(launcher)} -InstallHome ${q(path)}; function Find-NativeChrome { 'chrome.exe' }; function Open-NativeChrome { param($Chrome); $script:opened++ }; $script:opened=0; $script:started=0; function Start-NativeManualProcess { param($Node,$Repo,$HomePath); $script:started++; $p=[pscustomobject]@{HasExited=$false;ExitCode=0}; $p | Add-Member ScriptMethod Refresh {} -PassThru };`;
}

test('MANUAL-001 - BAT y PowerShell usan el lanzador manual y no una tarea de arranque', windows, async () => {
  ps(`$t=$null;$e=$null;[Management.Automation.Language.Parser]::ParseFile(${q(launcher)},[ref]$t,[ref]$e)|Out-Null;if($e.Count){throw($e|Out-String)}`);
  const bat = await readFile(join(root, 'TheLuxe.bat'), 'utf8');
  assert.match(bat, /%~dp0launch-native\.ps1/);
  assert.match(bat, /if errorlevel 1/);
  assert.doesNotMatch(bat, /schtasks|atstartup/i);
});

test('MANUAL-002 - espera el runtime completo antes de Chrome y no duplica un servidor sano', windows, async t => {
  const setup = await fixture(t);
  ps(`${setup} function Get-NetTCPConnection {}; $script:checks=0; function Test-NativeReady { param($Commit); $script:checks++; $script:checks -gt 1 }; Start-TheLuxeManual; if($script:started-ne 1 -or $script:opened-ne 1){throw 'No espero el inicio'}; function Test-NativeReady { $true }; Start-TheLuxeManual; if($script:started-ne 1 -or $script:opened-ne 2){throw 'Duplico el servidor'}`);
});

test('MANUAL-003 - puerto ajeno o proceso fallido no abren Chrome ni se matan procesos', windows, async t => {
  const setup = await fixture(t);
  ps(`${setup} function Test-NativeReady { $false }; function Get-NetTCPConnection { [pscustomobject]@{LocalPort=8000} }; $failed=$false; try { Start-TheLuxeManual } catch { $failed=$_.Exception.Message-match 'ocupados' }; if(-not $failed -or $script:started-ne 0 -or $script:opened-ne 0){throw 'Acepto puerto ajeno'}; function Get-NetTCPConnection {}; function Start-NativeManualProcess { $p=[pscustomobject]@{HasExited=$true;ExitCode=7}; $p | Add-Member ScriptMethod Refresh {} -PassThru }; $failed=$false; try { Start-TheLuxeManual } catch { $failed=$_.Exception.Message-match 'codigo 7' }; if(-not $failed -or $script:opened-ne 0){throw 'Oculto fallo de arranque'}`);
});

test('MANUAL-004 - disponibilidad exige API, version y actualizador local, no GitHub', windows, () => {
  ps(`. ${q(launcher)}; function Invoke-RestMethod { param($Uri,$TimeoutSec); if($Uri-match 'version') { return @{commit=('a'*40);version=('b'*64)} }; return @{ok=$true} }; $script:rpc=$true; function Invoke-WebRequest { param($Uri,$Method,$Headers,$TimeoutSec,[switch]$UseBasicParsing); if(-not $script:rpc){throw 'no updater'}; return @{StatusCode=204;Headers=@{'Access-Control-Allow-Origin'='http://127.0.0.1:8000'}} }; if(-not(Test-NativeReady ('a'*40))){throw 'No reconocio disponibilidad'}; $script:rpc=$false; if(Test-NativeReady ('a'*40)){throw 'Acepto solo web/API'}`);
});
