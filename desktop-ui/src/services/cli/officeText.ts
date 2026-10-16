/**
 * officeText.ts
 * Ekstraksi teks dokumen Office OOXML (Word .docx, Excel .xlsx, PowerPoint .pptx) untuk lampiran Chat GUI.
 *
 * Alasan: berkas Office adalah ZIP biner. Di mode aman, CLI agen tidak boleh menjalankan skrip ekstraksi
 * (Claude & Antigravity menolak shell; OpenCode `--file` menolak berkas biner), sehingga tanpa ekstraksi agen
 * tidak bisa menjawab sama sekali. Teks hasil ekstraksi disimpan sebagai berkas `.txt` pendamping yang dibaca
 * agen dengan tool baca berkas biasa. Spesifikasi: specs/agent-protocols.md §2 "Lampiran Chat GUI".
 *
 * Modul murni tanpa dependensi: ZIP dibaca manual, entri deflate dibuka dengan `DecompressionStream`
 * (WebView2/Chromium & Node ≥ 18). Format biner lama (.doc/.xls/.ppt) tidak didukung → null.
 */

export const OFFICE_EXTRACTABLE = /\.(docx|docm|xlsx|xlsm|pptx|pptm)$/i;
/** Batas teks hasil ekstraksi agar prompt/berkas pendamping tetap wajar. */
const MAX_TEXT_CHARS = 300_000;
const MAX_SHEET_ROWS = 5000;

type ZipEntries = Map<string, Uint8Array>;

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Membaca entri ZIP yang namanya lolos `want` (central directory; metode stored & deflate). */
async function readZip(bytes: Uint8Array, want: (name: string) => boolean): Promise<ZipEntries> {
  const out: ZipEntries = new Map();
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return out;
  const count = u16(bytes, eocd + 10);
  let p = u32(bytes, eocd + 16);
  const decoder = new TextDecoder();
  for (let n = 0; n < count && p + 46 <= bytes.length && u32(bytes, p) === 0x02014b50; n++) {
    const method = u16(bytes, p + 10);
    const size = u32(bytes, p + 20);
    const nameLen = u16(bytes, p + 28);
    const skip = nameLen + u16(bytes, p + 30) + u16(bytes, p + 32);
    const local = u32(bytes, p + 42);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + skip;
    if (!want(name) || u32(bytes, local) !== 0x04034b50) continue;
    const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
    const raw = bytes.subarray(start, start + size);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, await inflateRaw(raw));
  }
  return out;
}

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Teks run Word/DrawingML dalam satu potongan XML (`<w:t>`/`<a:t>`, tab, baris baru). */
function runText(xml: string, ns: 'w' | 'a'): string {
  const re = new RegExp(`<${ns}:t(?:\\s[^>]*)?>([\\s\\S]*?)</${ns}:t>|<${ns}:tab\\s*/>|<${ns}:br\\s*/>`, 'g');
  let text = '';
  for (const m of xml.matchAll(re)) {
    if (m[1] !== undefined) text += decodeXml(m[1]);
    else text += m[0].includes(':tab') ? '\t' : '\n';
  }
  return text;
}

const cellMd = (s: string) => s.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();

function markdownTable(rows: string[][]): string {
  if (rows.length === 0) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => cellMd(r[i] ?? '')).join(' | ')} |`;
  return [line(rows[0]), `| ${Array(width).fill('---').join(' | ')} |`, ...rows.slice(1).map(line)].join('\n');
}

function docxText(xml: string): string {
  const body = /<w:body>([\s\S]*)<\/w:body>/.exec(xml)?.[1] ?? xml;
  const blocks: string[] = [];
  for (const m of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[\s>][\s\S]*?<\/w:p>/g)) {
    const chunk = m[0];
    if (chunk.startsWith('<w:tbl>')) {
      const rows = [...chunk.matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)].map((r) =>
        [...r[0].matchAll(/<w:tc[\s>][\s\S]*?<\/w:tc>/g)].map((c) =>
          [...c[0].matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)].map((pp) => runText(pp[0], 'w')).join(' ')
        )
      );
      blocks.push(markdownTable(rows));
    } else {
      const t = runText(chunk, 'w');
      if (t.trim()) blocks.push(t);
    }
  }
  return blocks.join('\n\n');
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

function xlsxSheetRows(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const r of xml.matchAll(/<row[\s>][\s\S]*?<\/row>/g)) {
    if (rows.length >= MAX_SHEET_ROWS) break;
    const row: string[] = [];
    for (const c of r[0].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const inner = c[2] ?? '';
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value = '';
      if (type === 's' && v !== undefined) value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = runText(inner.replace(/<(\/?)t([\s>])/g, '<$1a:t$2'), 'a');
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      else if (v !== undefined) value = decodeXml(v);
      row[ref ? columnIndex(ref) : row.length] = value;
    }
    rows.push(Array.from(row, (x) => x ?? ''));
  }
  return rows;
}

async function xlsxText(bytes: Uint8Array): Promise<string> {
  const z = await readZip(bytes, (n) => /^xl\/(sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels|worksheets\/[^/]+\.xml)$/.test(n));
  const dec = new TextDecoder();
  const read = (n: string) => (z.has(n) ? dec.decode(z.get(n)) : '');
  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    runText(m[1].replace(/<(\/?)t([\s>])/g, '<$1a:t$2'), 'a')
  );
  const rels = new Map(
    [...read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\s[^>]*>/g)].map((m) => [
      /\bId="([^"]+)"/.exec(m[0])?.[1] ?? '',
      (/\bTarget="([^"]+)"/.exec(m[0])?.[1] ?? '').replace(/^\/?(xl\/)?/, 'xl/'),
    ])
  );
  const sheets = [...read('xl/workbook.xml').matchAll(/<sheet\s[^>]*>/g)].map((m) => ({
    name: decodeXml(/\bname="([^"]*)"/.exec(m[0])?.[1] ?? 'Sheet'),
    path: rels.get(/\br:id="([^"]+)"/.exec(m[0])?.[1] ?? '') ?? '',
  }));
  return sheets
    .filter((s) => z.has(s.path))
    .map((s) => {
      const rows = xlsxSheetRows(read(s.path), shared);
      const more = rows.length >= MAX_SHEET_ROWS ? `\n\n(Dipotong: hanya ${MAX_SHEET_ROWS} baris pertama.)` : '';
      return `## Sheet: ${s.name}\n\n${rows.length ? markdownTable(rows) : '(kosong)'}${more}`;
    })
    .join('\n\n');
}

async function pptxText(bytes: Uint8Array): Promise<string> {
  const z = await readZip(bytes, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  const dec = new TextDecoder();
  const num = (n: string) => Number(/slide(\d+)\.xml$/.exec(n)?.[1] ?? 0);
  return [...z.keys()]
    .sort((a, b) => num(a) - num(b))
    .map((n) => {
      const paras = [...dec.decode(z.get(n)).matchAll(/<a:p[\s>][\s\S]*?<\/a:p>/g)]
        .map((p) => runText(p[0], 'a').trim())
        .filter(Boolean);
      return `## Slide ${num(n)}\n\n${paras.join('\n') || '(tanpa teks)'}`;
    })
    .join('\n\n');
}

/**
 * Teks dokumen Office dalam Markdown (tabel Word/Excel sebagai tabel Markdown), diawali judul sumber.
 * null bila bukan OOXML yang didukung, berkas rusak, atau tidak memuat teks.
 */
export async function extractOfficeText(bytes: Uint8Array, fileName: string): Promise<string | null> {
  const ext = /\.([a-z]+)$/i.exec(fileName)?.[1]?.toLowerCase() ?? '';
  if (!OFFICE_EXTRACTABLE.test(fileName)) return null;
  try {
    let text = '';
    let kind = '';
    if (ext.startsWith('doc')) {
      kind = 'Word';
      const z = await readZip(bytes, (n) => n === 'word/document.xml');
      const xml = z.get('word/document.xml');
      text = xml ? docxText(new TextDecoder().decode(xml)) : '';
    } else if (ext.startsWith('xls')) {
      kind = 'Excel';
      text = await xlsxText(bytes);
    } else {
      kind = 'PowerPoint';
      text = await pptxText(bytes);
    }
    if (!text.trim()) return null;
    const cut = text.length > MAX_TEXT_CHARS;
    return (
      `# Teks hasil ekstraksi Soraja dari "${fileName}" (${kind})\n\n` +
      `${cut ? text.slice(0, MAX_TEXT_CHARS) : text}\n` +
      (cut ? `\n(Dipotong: hanya ${MAX_TEXT_CHARS.toLocaleString('id-ID')} karakter pertama.)\n` : '')
    );
  } catch {
    return null;
  }
}
