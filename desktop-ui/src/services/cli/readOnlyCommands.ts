/**
 * readOnlyCommands.ts
 * Deteksi perintah shell yang hanya MEMBACA (tidak mengubah berkas/sistem) untuk HITL Chat GUI Mode Aman:
 * perintah seperti ini diizinkan otomatis tanpa modal (specs/agent-protocols.md §7). Rangkaian perintah
 * (`;`, `|`, `&&`, blok `{ }` / `( )`) lolos hanya bila SEMUA bagiannya baca-saja. Pendekatannya allow-list
 * yang konservatif: apa pun yang tidak dikenali → tetap ditanyakan ke pengguna. Modul murni (tanpa import runtime).
 */

/** Program/cmdlet yang hanya membaca. Kunci huruf kecil. */
const READ_ONLY_PROGRAMS = new Set([
  // Bash / coreutils
  'ls', 'dir', 'cat', 'head', 'tail', 'wc', 'grep', 'egrep', 'fgrep', 'rg', 'pwd', 'echo', 'printf', 'which',
  'whereis', 'file', 'stat', 'du', 'df', 'tree', 'uniq', 'cut', 'tr', 'diff', 'cmp', 'basename', 'dirname',
  'realpath', 'readlink', 'date', 'whoami', 'hostname', 'uname', 'true', 'cd', 'nl', 'less', 'more', 'column',
  'jq', 'type', 'where', 'find', 'fd',
  // PowerShell (cmdlet & alias)
  'get-content', 'gc', 'get-childitem', 'gci', 'get-item', 'gi', 'get-itemproperty', 'gp', 'get-location', 'gl',
  'set-location', 'sl', 'chdir', 'test-path', 'resolve-path', 'rvpa', 'split-path', 'join-path', 'select-string', 'sls',
  'select-object', 'select', 'where-object', '?', 'sort-object', 'sort', 'measure-object', 'measure', 'group-object',
  'group', 'format-table', 'ft', 'format-list', 'fl', 'format-wide', 'fw', 'out-string', 'out-host', 'get-command',
  'gcm', 'get-date', 'get-filehash', 'convertfrom-json', 'convertto-json', 'convertfrom-csv', 'convertto-csv',
  'write-output', 'write', 'write-host', 'compare-object', 'get-member', 'gm', 'get-process', 'gps', 'get-help',
  'get-variable', 'gv', 'get-unique', 'get-psdrive', 'get-culture', 'get-host', 'get-acl',
  'foreach-object', '%', 'foreach',
]);

/** `sort` bisa menulis berkas lewat `-o`; `foreach-object` bisa memanggil method lewat `-MemberName`. */
const ITERATORS = new Set(['foreach-object', '%', 'foreach']);

/** Sub-perintah Git yang hanya membaca. `branch`, `stash`, `remote`, `config`, `tag` dicek terpisah. */
const GIT_READ_ONLY = new Set([
  'status', 'diff', 'log', 'show', 'rev-parse', 'ls-files', 'ls-tree', 'blame', 'shortlog', 'describe', 'grep',
  'check-ignore', 'cat-file', 'whatchanged', 'name-rev', 'merge-base', 'count-objects',
]);

/** Method .NET yang aman dipanggil di ekspresi PowerShell (manipulasi string/nilai saja). */
const SAFE_METHODS = new Set([
  'replace', 'substring', 'trim', 'trimstart', 'trimend', 'tolower', 'toupper', 'split', 'join', 'contains',
  'startswith', 'endswith', 'tostring', 'indexof', 'lastindexof', 'padleft', 'padright', 'equals', 'format',
  'getfilename', 'getextension', 'getdirectoryname', 'combine', 'gettype', 'count', 'length',
]);

/** Pengalihan yang aman (buang output / gabung stderr); pengalihan lain ke berkas = menulis. */
const SAFE_REDIRECT = /\d?>\s*(\$null|nul|\/dev\/null)\b|\d?>&\d/gi;

/** Mengganti isi literal string dengan string kosong agar operator di dalam string tidak ikut dianalisis. */
function stripStrings(command: string): string | null {
  let out = '';
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch !== '"' && ch !== "'") {
      out += ch;
      continue;
    }
    const end = command.indexOf(ch, i + 1);
    if (end < 0) return null; // string tidak tertutup → tidak bisa dianalisis
    out += ch + ch;
    i = end;
  }
  return out;
}

function gitIsReadOnly(args: string[]): boolean {
  const [sub, ...rest] = args;
  if (!sub || sub.startsWith('-')) return false; // `git -c ...` / `git -C ...` mengubah konfigurasi eksekusi
  if (rest.some((a) => /^--(output|ext-diff|exec)|^--no-index$/i.test(a))) return false;
  if (GIT_READ_ONLY.has(sub)) return true;
  if (sub === 'branch') return rest.every((a) => /^(-a|-r|-v|-vv|--all|--list|--show-current|--remotes|--verbose|--no-color)$/.test(a));
  if (sub === 'stash' || sub === 'worktree') return rest[0] === 'list';
  if (sub === 'remote') return rest.every((a) => a === '-v' || a === '--verbose');
  if (sub === 'tag') return rest.length === 0 || rest.every((a) => a === '-l' || a === '--list');
  if (sub === 'config') return rest[0] === '--get' || rest[0] === '--list' || rest[0] === '-l' || rest[0] === '--get-regexp';
  return false;
}

/** Satu bagian perintah (tanpa pemisah). `allowExpression` = dialek PowerShell (`$var`, `.Prop`, `"…" -f`). */
function segmentIsReadOnly(segment: string, allowExpression: boolean): boolean {
  const words = segment.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const first = words[0];
  if (allowExpression && (/^\$[\w:]/.test(first) || /^\.[A-Za-z_]/.test(first) || /^(""|''|\d)/.test(first))) return true;
  const program = first.toLowerCase();
  const args = words.slice(1);
  if (program === 'git') return gitIsReadOnly(args);
  if (args.length === 1 && args[0] === '--version') return /^[\w.-]+$/.test(program);
  if (!READ_ONLY_PROGRAMS.has(program)) return false;
  if (ITERATORS.has(program)) return args.every((a) => /^-(process|begin|end)$/i.test(a)); // hanya script block
  if (program === 'sort' && args.some((a) => /^-o|^--output/.test(a))) return false;
  if ((program === 'find' || program === 'fd') && args.some((a) => /^-(exec|execdir|ok|okdir|delete|fprint|x|X)$/.test(a))) return false;
  return true;
}

/**
 * Apakah perintah shell hanya membaca? `powershell` = perintah tool PowerShell (Claude), yang mengizinkan
 * ekspresi berawalan `$`/`.` (di Bash, `$VAR` di posisi perintah justru menjalankan isinya).
 */
export function isReadOnlyCommand(command: string, powershell: boolean): boolean {
  const raw = command.trim();
  if (!raw || raw.length > 2000) return false;
  // Substitusi perintah, escape/continuation, panggilan statis .NET, dan perintah multi-baris selalu ditanyakan.
  if (/\$\(|`|::|\r|\n|<\(/.test(raw)) return false;
  const stripped = stripStrings(raw);
  if (stripped === null) return false;
  const noRedirect = stripped.replace(SAFE_REDIRECT, ' ');
  if (/[<>]/.test(noRedirect)) return false; // menulis/membaca berkas lewat pengalihan
  if (/(^|[^&])&([^&]|$)/.test(noRedirect)) return false; // operator panggil `&` / jalan di latar belakang
  if (/@[{(]|\[[A-Za-z]/.test(noRedirect)) return false; // hashtable/array PowerShell & literal tipe .NET
  for (const m of noRedirect.matchAll(/\.\s*([A-Za-z_]\w*)\s*\(/g)) {
    if (!SAFE_METHODS.has(m[1].toLowerCase())) return false; // mis. `.Delete()`, `.Kill()`
  }
  // Penugasan PowerShell (`$x = Remove-Item …`) diperlakukan sebagai pemisah agar bagian kanannya ikut dicek.
  const unassigned = noRedirect.replace(/(\$[\w:.]+\s*[-+*/]?)=(?!=)/g, '$1;');
  // Pemisah: rangkaian, pipa, blok, dan sub-ekspresi.
  const segments = unassigned.split(/&&|\|\||[|;{}()]/);
  return segments.every((s) => segmentIsReadOnly(s, powershell));
}
