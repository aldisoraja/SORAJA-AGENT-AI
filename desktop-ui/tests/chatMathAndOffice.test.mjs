/**
 * Chat GUI: rumus LaTeX terbaca tanpa renderer math, ekstraksi teks dokumen Office untuk lampiran,
 * dan prompt lampiran yang mengarahkan agen ke teks hasil ekstraksi.
 * Kasus diambil dari uji langsung 16 Okt 2026 (jawaban Codex ber-LaTeX; DOCX tak terbaca di mode aman).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { latexToText, normalizeLatexMath } from '../src/utils/mathText.ts';
import { extractOfficeText } from '../src/services/cli/officeText.ts';
import { buildChatPrompt } from '../src/services/cli/chatPrompt.ts';
import { buildHeadlessCommand } from '../src/services/cli/agentCommands.ts';

test('LaTeX jawaban Codex nyata menjadi teks Unicode yang terbaca', () => {
  const md = '### Hitungan dan suhu\n\n- \\(17 \\times 23 - 45 = 346\\)\n- \\(38{,}5^\\circ\\text{C} = 101{,}3^\\circ\\text{F}\\)';
  assert.equal(normalizeLatexMath(md), '### Hitungan dan suhu\n\n- 17 × 23 - 45 = 346\n- 38,5 °C = 101,3 °F');
});

test('LaTeX: pecahan, akar, pangkat, relasi, dan blok $$', () => {
  assert.equal(latexToText('\\frac{1}{2} \\times a \\times t'), '1/2 × a × t');
  assert.equal(latexToText('x^2 + y^{2} \\le r^2'), 'x² + y² ≤ r²');
  assert.equal(latexToText('\\sqrt{b^2 - 4ac}'), '√(b² - 4ac)');
  assert.equal(latexToText('38{,}5^{\\circ}\\mathrm{C}'), '38,5 °C');
  assert.equal(normalizeLatexMath('Rumus:\n\\[E = mc^2\\]'), 'Rumus:\nE = mc²');
  assert.equal(normalizeLatexMath('$$\\frac{a+b}{2}$$'), '(a+b)/2');
});

test('LaTeX: kode, harga $, dan teks tanpa rumus tidak diubah', () => {
  for (const s of ['harga $5 dan $10', 'kode `\\(x\\)` tetap', '```tex\n\\(x\\)\n```', 'tanpa rumus sama sekali']) {
    assert.equal(normalizeLatexMath(s), s);
  }
});

/** ZIP minimal (deflate) seperti berkas Office asli. */
function zip(files) {
  const enc = new TextEncoder();
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const data = deflateRawSync(Buffer.from(text, 'utf8'));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt16LE(nameBytes.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt16LE(nameBytes.length, 28);
    cd.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    central.push(cd, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cdBuf, eocd]));
}

test('Office: tabel Word menjadi tabel Markdown, urutan paragraf terjaga', async () => {
  const cell = (t) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
  const xml =
    '<w:document><w:body><w:p><w:r><w:t>Daftar Karyawan</w:t></w:r></w:p><w:tbl>' +
    `<w:tr>${cell('Nama')}${cell('Departemen')}</w:tr><w:tr>${cell('Dedi Kurnia')}${cell('IT &amp; Data')}</w:tr>` +
    '</w:tbl><w:p><w:r><w:t xml:space="preserve">Catatan </w:t></w:r><w:r><w:t>akhir</w:t></w:r></w:p></w:body></w:document>';
  const text = await extractOfficeText(zip({ 'word/document.xml': xml }), 'karyawan.docx');
  assert.equal(
    text,
    '# Teks hasil ekstraksi Soraja dari "karyawan.docx" (Word)\n\nDaftar Karyawan\n\n' +
      '| Nama | Departemen |\n| --- | --- |\n| Dedi Kurnia | IT & Data |\n\nCatatan akhir\n'
  );
});

test('Office: Excel per sheet (shared string, angka, formula, kolom kosong) dan slide PowerPoint berurutan', async () => {
  const xlsx = zip({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Stok" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Barang</t></si><si><t>Mouse</t></si></sst>',
    'xl/worksheets/sheet1.xml':
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Jumlah</t></is></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="C2"><f>10+17</f><v>27</v></c></row></sheetData></worksheet>',
  });
  assert.match(await extractOfficeText(xlsx, 'stok.xlsx'), /## Sheet: Stok\n\n\| Barang \|  \| Jumlah \|\n\| --- \| --- \| --- \|\n\| Mouse \|  \| 27 \|/);
  const slide = (t) => `<p:sld><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:sld>`;
  const pptx = zip({ 'ppt/slides/slide10.xml': slide('Penutup'), 'ppt/slides/slide2.xml': slide('Isi'), 'ppt/slides/slide1.xml': slide('Judul') });
  const text = await extractOfficeText(pptx, 'deck.pptx');
  assert.ok(text.indexOf('Slide 1') < text.indexOf('Slide 2') && text.indexOf('Slide 2') < text.indexOf('Slide 10'));
});

test('Office: format lama / berkas rusak → null (tanpa berkas pendamping)', async () => {
  assert.equal(await extractOfficeText(new Uint8Array([1, 2, 3]), 'lama.doc'), null);
  assert.equal(await extractOfficeText(new Uint8Array([1, 2, 3]), 'rusak.docx'), null);
});

test('Prompt lampiran: dokumen Office menunjuk teks hasil ekstraksi & tidak meminta menjalankan skrip', () => {
  const prompt = buildChatPrompt('Berapa karyawan IT?', [
    { path: 'D:/p/.soraja/attachments/m/01-karyawan.docx', name: 'karyawan.docx', kind: 'document', textPath: 'D:/p/.soraja/attachments/m/01-karyawan.docx.txt' },
  ]);
  assert.match(prompt, /Dokumen #1 "karyawan\.docx": D:\/p\/\.soraja\/attachments\/m\/01-karyawan\.docx\n {2}Teks hasil ekstraksi \(baca berkas ini\): .*01-karyawan\.docx\.txt/);
  assert.match(prompt, /tidak perlu menjalankan skrip/);
  assert.doesNotMatch(prompt, /skrip Python/);
});

test('OpenCode: berkas biner tidak pernah dikirim lewat --file (bug "Cannot read binary file" → exit 1)', () => {
  const { args } = buildHeadlessCommand({
    agentId: 'opencode', executable: 'opencode', cwd: 'D:/p', prompt: 'x',
    filePaths: ['D:/p/a/01-karyawan.docx.txt', 'D:/p/a/02-laporan.pdf', 'D:/p/a/03-lama.xls'],
  });
  assert.deepEqual(args.filter((a) => a.startsWith('--file=')), ['--file=D:/p/a/01-karyawan.docx.txt', '--file=D:/p/a/02-laporan.pdf']);
});

test('Mode aman Chat GUI: Kiro boleh baca/ubah berkas tanpa shell; Antigravity diberi tahu shell ditolak', () => {
  const kiro = buildHeadlessCommand({ agentId: 'kiro', executable: 'kiro-cli', cwd: 'D:/p', prompt: 'x', permissionMode: 'safe' });
  const trust = kiro.args.find((a) => a.startsWith('--trust-tools='));
  assert.ok(trust && /str_replace/.test(trust) && /fs_write/.test(trust) && !/bash|pwsh|delete/.test(trust));
  const kiroAuto = buildHeadlessCommand({ agentId: 'kiro', executable: 'kiro-cli', cwd: 'D:/p', prompt: 'x', permissionMode: 'autonomous' });
  assert.ok(kiroAuto.args.includes('--trust-all-tools') && !kiroAuto.args.some((a) => a.startsWith('--trust-tools=')));

  const agy = buildHeadlessCommand({ agentId: 'antigravity', executable: 'agy', cwd: 'D:/p', prompt: 'Ubah kode', permissionMode: 'safe' });
  assert.match(agy.args[agy.args.indexOf('-p') + 1], /\[Mode aman\] Perintah terminal\/shell \(RunCommand\) otomatis ditolak[\s\S]*Ubah kode$/);
  const agyAuto = buildHeadlessCommand({ agentId: 'antigravity', executable: 'agy', cwd: 'D:/p', prompt: 'Ubah kode', permissionMode: 'autonomous' });
  assert.doesNotMatch(agyAuto.args[agyAuto.args.indexOf('-p') + 1], /Mode aman/);
});
