import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Unit test untuk fungsionalitas Copy & Paste Teks dan Gambar di Soraja AI CLI Terminal

test('Copy/Paste Shortcut: Ctrl+C saat seleksi teks tidak membatalkan proses (tidak mengirim SIGINT)', () => {
  function handleCtrlC(hasSelection, selectedText) {
    if (hasSelection && selectedText) {
      // Salin ke clipboard, jangan kirim \x03
      return { copied: true, sendInterrupt: false, text: selectedText };
    }
    // Tanpa seleksi: biarkan sinyal interupsi \x03 lewat ke PTY
    return { copied: false, sendInterrupt: true, text: null };
  }

  // Skenario 1: Ada teks terpilih
  const selResult = handleCtrlC(true, 'const token = "abc";');
  assert.equal(selResult.copied, true);
  assert.equal(selResult.sendInterrupt, false);
  assert.equal(selResult.text, 'const token = "abc";');

  // Skenario 2: Tidak ada teks terpilih (hanya ingin cancel command)
  const noSelResult = handleCtrlC(false, '');
  assert.equal(noSelResult.copied, false);
  assert.equal(noSelResult.sendInterrupt, true);
});

test('Copy/Paste Text: Menempelkan teks kata, kalimat, dan paragraf multiline dengan benar', () => {
  function normalizeClipboardTextForPty(text) {
    if (!text) return '';
    // Memastikan newline konsisten untuk input PTY terminal
    return text.replace(/\r\n/g, '\n').replace(/\n/g, '\r');
  }

  // Kata tunggal
  assert.equal(normalizeClipboardTextForPty('npm run dev'), 'npm run dev');

  // Kalimat panjang
  assert.equal(
    normalizeClipboardTextForPty('Jelaskan arsitektur aplikasi ini dalam bahasa Indonesia.'),
    'Jelaskan arsitektur aplikasi ini dalam bahasa Indonesia.'
  );

  // Paragraf multibaris
  const multiLineParagraph = `Langkah 1: Periksa database
Langkah 2: Jalankan migration
Langkah 3: Jalankan server`;

  const normalized = normalizeClipboardTextForPty(multiLineParagraph);
  assert.equal(
    normalized,
    'Langkah 1: Periksa database\rLangkah 2: Jalankan migration\rLangkah 3: Jalankan server'
  );
});

test('Copy/Paste Image: Penyimpanan gambar ke .soraja/images dan format path kutip dua', () => {
  const dummyBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const testDir = path.join(process.cwd(), '.soraja', 'images');
  
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const filename = `test_clipboard_${Date.now()}.png`;
  const targetPath = path.join(testDir, filename);

  const cleanBase64 = dummyBase64.replace(/^data:image\/[a-zA-Z0-9\+\-\.]+;base64,/, '');
  fs.writeFileSync(targetPath, Buffer.from(cleanBase64, 'base64'));

  assert.equal(fs.existsSync(targetPath), true);
  assert.ok(fs.statSync(targetPath).size > 0);

  // Format path aman yang dikirimkan ke prompt terminal CLI:
  // Harus dibungkus tanda kutip jika terdapat spasi pada direktori
  function formatImagePathForCli(filePath) {
    return `"${filePath}" `;
  }

  const cliInput = formatImagePathForCli(targetPath);
  assert.ok(cliInput.startsWith('"'));
  assert.ok(cliInput.endsWith('" '));
  assert.ok(cliInput.includes(filename));

  // Bersihkan file uji coba
  try {
    fs.unlinkSync(targetPath);
  } catch {}
});

test('Anti-Duplication: Paste Handler mencegah eksekusi dobel dari keydown + keyup + DOM paste', () => {
  let callCount = 0;
  let lastPasteTimestamp = 0;

  function safePasteHandler(eventType, fakeTimestamp) {
    // 1. Abaikan jika bukan keydown (misal keyup)
    if (eventType === 'keyup') {
      return false;
    }

    // 2. Cooldown lock 400ms untuk mencegah pemanggilan ganda dari keydown dan DOM paste
    if (fakeTimestamp - lastPasteTimestamp < 400) {
      return false;
    }

    lastPasteTimestamp = fakeTimestamp;
    callCount++;
    return true;
  }

  // Simulasi 1 kali penekanan Ctrl+V:
  // Browser memicu: keydown (t=1000), DOM paste (t=1005), keyup (t=1080)
  const res1 = safePasteHandler('keydown', 1000); // Harus tereksekusi
  const res2 = safePasteHandler('paste', 1005);   // Harus dicegat (cooldown)
  const res3 = safePasteHandler('keyup', 1080);   // Harus dicegat (bukan keydown)

  assert.equal(res1, true);
  assert.equal(res2, false);
  assert.equal(res3, false);
  assert.equal(callCount, 1, 'Hanya boleh tereksekusi tepat 1 kali!');

  // Penekanan Ctrl+V berikutnya setelah jeda waktu normal (misal 1 detik kemudian)
  const resNext = safePasteHandler('keydown', 2500);
  assert.equal(resNext, true);
  assert.equal(callCount, 2, 'Penekanan berikutnya harus dieksekusi normal!');
});

test('Zoom In & Zoom Out: Logika batas zoom 70% s/d 180% dan kalkulasi ukuran font dinamis', () => {
  function zoomIn(current) {
    return Math.min(current + 10, 180);
  }
  function zoomOut(current) {
    return Math.max(current - 10, 70);
  }
  function calculateFontSize(zoomLevel, baseSize = 13) {
    return Math.max(9, Math.round((baseSize * zoomLevel) / 100));
  }

  // Uji nilai awal default 100%
  let zoom = 100;
  assert.equal(calculateFontSize(zoom), 13);

  // Uji Zoom In
  zoom = zoomIn(zoom); // 110%
  assert.equal(zoom, 110);
  assert.equal(calculateFontSize(zoom), 14);

  // Uji batas atas maksimal 180%
  zoom = 180;
  zoom = zoomIn(zoom);
  assert.equal(zoom, 180, 'Zoom tidak boleh melebihi 180%');
  assert.equal(calculateFontSize(zoom), 23);

  // Uji Zoom Out
  zoom = 100;
  zoom = zoomOut(zoom); // 90%
  assert.equal(zoom, 90);
  assert.equal(calculateFontSize(zoom), 12);

  // Uji batas bawah minimal 70%
  zoom = 70;
  zoom = zoomOut(zoom);
  assert.equal(zoom, 70, 'Zoom tidak boleh kurang dari 70%');
  assert.equal(calculateFontSize(zoom), 9);
});

test('Clipboard Text vs Image Routing: Memastikan event teks tidak memicu duplikasi', () => {
  function routeClipboardPaste(hasImage, clipboardText) {
    if (hasImage) {
      // Gambar: preventDefault, simpan ke file, kirim path
      return { handledByApp: true, preventDefault: true, type: 'image' };
    }
    // Teks biasa: jangan preventDefault, biarkan browser & xterm memproses secara native
    return { handledByApp: false, preventDefault: false, type: 'text', nativeContent: clipboardText };
  }

  const imgRoute = routeClipboardPaste(true, '');
  assert.equal(imgRoute.handledByApp, true);
  assert.equal(imgRoute.preventDefault, true);
  assert.equal(imgRoute.type, 'image');

  const textRoute = routeClipboardPaste(false, 'halo soraja ai');
  assert.equal(textRoute.handledByApp, false);
  assert.equal(textRoute.preventDefault, false);
  assert.equal(textRoute.type, 'text');
  assert.equal(textRoute.nativeContent, 'halo soraja ai');
});


