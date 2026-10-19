/**
 * HITL Chat GUI Mode Aman: perintah shell yang hanya membaca diizinkan otomatis, sisanya tetap ditanyakan.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isReadOnlyCommand } from '../src/services/cli/readOnlyCommands.ts';
import { summarizePermissionRequest } from '../src/services/cli/permissionRules.ts';

const PS_PIPELINE =
  "(Get-Content desktop-ui/src/components/terminal/EmbeddedCliTerminal.tsx | Measure-Object -Line).Lines; " +
  '(Get-Content crates/soraja-desktop/src/main.rs | Measure-Object -Line).Lines; ' +
  'Get-ChildItem -Recurse crates -Include *.rs,*.toml | ForEach-Object { "{0,5} {1}" -f ' +
  "(Get-Content $_.FullName | Measure-Object -Line).Lines, $_.FullName.Replace((Get-Location).Path+'\\','') }";

test('perintah baca-saja (termasuk rangkaian) lolos otomatis', () => {
  const ps = [
    PS_PIPELINE,
    'Get-ChildItem -Recurse src | Where-Object { $_.Length -gt 1000 } | Sort-Object Length -Descending | Select-Object -First 5',
    'Get-Content package.json | ConvertFrom-Json',
    'Select-String -Path src/*.ts -Pattern "invoke\\(" | Measure-Object',
    'Test-Path .claude; Get-Location',
    'git status --short; git log --oneline -5; git diff --stat 2>&1',
    '$files = Get-ChildItem src -Recurse; $files.Count',
  ];
  for (const c of ps) assert.equal(isReadOnlyCommand(c, true), true, c);
  const bash = [
    'ls -la && cat README.md | head -20',
    'grep -rn "TODO" src | wc -l',
    'git log --format=%h -3 && git branch -a',
    'find . -name "*.rs" -not -path "./target/*" | sort',
    'node --version; pnpm --version',
    'wc -l src/*.ts 2>/dev/null | tail -1',
  ];
  for (const c of bash) assert.equal(isReadOnlyCommand(c, false), true, c);
});

test('perintah yang mengubah sesuatu atau tidak bisa dianalisis tetap ditanyakan', () => {
  const ps = [
    'Remove-Item foo.txt',
    'Get-ChildItem | Remove-Item',
    'Get-ChildItem | ForEach-Object { Remove-Item $_ }',
    'Get-ChildItem | ForEach-Object Delete',
    'Get-ChildItem *.log | ForEach-Object { $_.Delete() }',
    '(Get-Item foo).Delete()',
    'Get-Content a.txt | Set-Content b.txt',
    'Get-Content a.txt > b.txt',
    '$x = Remove-Item foo',
    '& $cmd',
    '. .\\script.ps1',
    '[System.IO.File]::Delete("x")',
    'Write-Output "$(Remove-Item x)"',
    'Get-Process | Stop-Process',
    'Invoke-Expression "ls"',
    'npm install',
    'Get-Content x | Out-File y',
    'Select-Object @{n="a";e={Remove-Item x}}',
    'Get-Content "tidak tertutup',
  ];
  for (const c of ps) assert.equal(isReadOnlyCommand(c, true), false, c);
  const bash = [
    'rm -rf node_modules',
    'cat a > b',
    'echo hi | tee out.txt',
    'find . -name "*.tmp" -delete',
    'find . -exec rm {} \\;',
    'git checkout -- .',
    'git branch -D fitur',
    'git -c core.pager=evil log',
    'git diff --output=patch.txt',
    'sort data -o data',
    '$CMD',
    'ls `rm -rf x`',
    'ls $(rm x)',
    'sleep 100 &',
    'X=1 ls',
    'ls\nrm x',
  ];
  for (const c of bash) assert.equal(isReadOnlyCommand(c, false), false, c);
});

test('summarizePermissionRequest: readOnly hanya untuk tool shell & bukan perintah berbahaya', () => {
  assert.equal(summarizePermissionRequest('PowerShell', { command: PS_PIPELINE }).readOnly, true);
  assert.equal(summarizePermissionRequest('Bash', { command: 'git status' }).readOnly, true);
  assert.equal(summarizePermissionRequest('Bash', { command: '$X; ls' }).readOnly, false, '$ di Bash menjalankan isi variabel');
  assert.equal(summarizePermissionRequest('Write', { file_path: 'a.txt', command: 'ls' }).readOnly, false);
  assert.equal(summarizePermissionRequest('Bash', { command: 'git push --force' }).readOnly, false);
  assert.equal(summarizePermissionRequest('WebFetch', { url: 'https://x' }).readOnly, false);
});
