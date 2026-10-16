import React from 'react';
import { Marked, type Tokens } from 'marked';
import { invoke } from '@tauri-apps/api/core';
import { copyText } from '../../utils/clipboard';
import { isTauriRuntime } from '../../services/headlessTransport';
import { normalizeLatexMath } from '../../utils/mathText';
import './markdown.css';

interface MarkdownContentProps {
  content: string;
  isLight?: boolean;
  /** `compact` = teks lebih kecil (mis. isi blok penalaran). */
  size?: 'normal' | 'compact';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CALLOUTS: Record<string, string> = {
  NOTE: 'info', TIP: 'tip', IMPORTANT: 'info', WARNING: 'warn', CAUTION: 'error',
};
/** Notice dari Soraja/CLI diawali emoji (lihat useAgentStreamBridge) → gaya callout yang sesuai. */
const EMOJI_CALLOUTS: Array<[RegExp, string]> = [
  [/^<p>(❌)/u, 'error'],
  [/^<p>(⚠️|⚠)/u, 'warn'],
  [/^<p>(ℹ️|ℹ|💡)/u, 'info'],
  [/^<p>(⏹️|⏹)/u, 'muted'],
];

const md = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    code({ text, lang }: Tokens.Code) {
      const language = (lang || '').trim().split(/\s+/)[0] || 'teks';
      return (
        `<div class="md-code"><div class="md-code-head"><span class="md-code-lang">${escapeHtml(language)}</span>` +
        `<button type="button" class="md-copy" data-copy-code>Salin</button></div>` +
        `<pre><code>${escapeHtml(text.replace(/\n$/, ''))}</code></pre></div>`
      );
    },
    // HTML mentah dari agen ditampilkan sebagai teks (webview Tauri punya akses IPC).
    html({ text }: Tokens.HTML | Tokens.Tag) {
      return escapeHtml(text);
    },
    blockquote({ tokens }: Tokens.Blockquote) {
      let body = this.parser.parse(tokens);
      let kind = '';
      const gh = /^<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(<br>)?\s*/i.exec(body);
      if (gh) {
        kind = CALLOUTS[gh[1].toUpperCase()];
        body = `<p>${body.slice(gh[0].length)}`;
      } else {
        kind = EMOJI_CALLOUTS.find(([re]) => re.test(body))?.[1] ?? '';
      }
      return `<blockquote${kind ? ` class="md-callout md-callout-${kind}"` : ''}>${body}</blockquote>`;
    },
  },
});

/** Link di jawaban dibuka di browser sistem, bukan menggantikan isi aplikasi. */
function openExternal(url: string) {
  if (isTauriRuntime) {
    invoke('plugin:opener|open_url', { url }).catch((err) => console.warn('Gagal membuka tautan:', err));
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export function MarkdownContent({ content, isLight = false, size = 'normal' }: MarkdownContentProps) {
  const html = React.useMemo(() => {
    if (!content) return '';
    try {
      // Tanpa renderer math: rumus LaTeX diubah ke teks Unicode agar tidak tampil mentah.
      return (md.parse(normalizeLatexMath(content)) as string)
        .replace(/<table>/g, '<div class="md-table-wrap"><table>')
        .replace(/<\/table>/g, '</table></div>');
    } catch (e) {
      console.error('Gagal mem-parse markdown:', e);
      return `<p>${escapeHtml(content)}</p>`;
    }
  }, [content]);

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const copyBtn = target.closest<HTMLButtonElement>('[data-copy-code]');
    if (copyBtn) {
      const code = copyBtn.closest('.md-code')?.querySelector('code')?.textContent ?? '';
      void copyText(code).then((ok) => {
        copyBtn.textContent = ok ? 'Tersalin ✓' : 'Gagal';
        copyBtn.classList.toggle('md-copied', ok);
        setTimeout(() => {
          copyBtn.textContent = 'Salin';
          copyBtn.classList.remove('md-copied');
        }, 1600);
      });
      return;
    }
    const link = target.closest<HTMLAnchorElement>('a[href]');
    if (link) {
      const href = link.getAttribute('href') || '';
      e.preventDefault();
      if (/^(https?:|mailto:)/i.test(href)) openExternal(href);
    }
  };

  return (
    <div
      className={`md-root select-text ${isLight ? 'md-light' : 'md-dark'} ${size === 'compact' ? 'md-compact' : ''}`}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
