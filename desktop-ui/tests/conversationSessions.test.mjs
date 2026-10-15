import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCliConversation,
  pickResumableChat,
  titleFromPrompt,
  uniqueConversationTitle,
} from '../src/utils/conversationTitle.ts';

const NOW = new Date(2026, 9, 14, 15, 0, 0);
const conv = (id, projectId, updatedAt) => ({
  id,
  projectId,
  title: id,
  agentId: 'claude',
  modelId: 'm',
  status: 'active',
  timeAgo: '',
  createdAt: updatedAt.toISOString(),
  updatedAt: updatedAt.toISOString(),
});

test('titleFromPrompt: baris pertama berisi, dirapikan, maks. 60 karakter', () => {
  assert.equal(titleFromPrompt('\n  Tolong   cek   README  \nbaris dua'), 'Tolong cek README');
  const long = titleFromPrompt('x'.repeat(100));
  assert.equal(long.length, 60);
  assert.ok(long.endsWith('...'));
  assert.equal(titleFromPrompt('   \n  ', 'gambar.png'), 'gambar.png');
});

test('uniqueConversationTitle: judul kembar diberi akhiran agar tidak ditolak penyimpanan', () => {
  assert.equal(uniqueConversationTitle('Halo', ['lain']), 'Halo');
  assert.equal(uniqueConversationTitle('Halo', ['halo']), 'Halo (2)');
  assert.equal(uniqueConversationTitle('Halo', ['Halo', 'Halo (2)']), 'Halo (3)');
});

test('isCliConversation: hanya berdasarkan prefiks id, bukan judul', () => {
  assert.equal(isCliConversation({ id: 'conv-cli-claude-1' }), true);
  assert.equal(isCliConversation({ id: 'conv-123', title: 'buat cli tool' }), false);
  assert.equal(isCliConversation(null), false);
});

test('pickResumableChat: melanjutkan sesi chat terbaru HARI INI milik proyek; selain itu null (draf)', () => {
  const today = new Date(2026, 9, 14, 9, 0, 0);
  const later = new Date(2026, 9, 14, 11, 0, 0);
  const yesterday = new Date(2026, 9, 13, 23, 0, 0);
  const convs = [
    conv('conv-a', 'p1', today),
    conv('conv-b', 'p1', later),
    conv('conv-cli-x', 'p1', new Date(2026, 9, 14, 14, 0, 0)), // CLI tidak dihitung
    conv('conv-c', 'p2', later),
    conv('conv-old', 'p3', yesterday),
  ];
  assert.equal(pickResumableChat(convs, 'p1', NOW)?.id, 'conv-b');
  assert.equal(pickResumableChat(convs, 'p2', NOW)?.id, 'conv-c');
  assert.equal(pickResumableChat(convs, 'p3', NOW), null); // kemarin → draf
  assert.equal(pickResumableChat(convs, 'p4', NOW), null); // belum ada
});
