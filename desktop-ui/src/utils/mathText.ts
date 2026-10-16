/**
 * mathText.ts
 * Chat GUI tidak memuat renderer LaTeX: rumus `\( … \)`, `\[ … \]`, dan `$$ … $$` dari agen (sering dari Codex)
 * tampil mentah, mis. "(38{,}5^\circ\text{C})". Fungsi di sini mengubah notasi umum menjadi teks Unicode yang
 * terbaca ("38,5 °C") sebelum Markdown dirender. Blok kode & inline code tidak disentuh; `$…$` tunggal juga
 * tidak, karena sering berupa harga atau variabel shell. Modul murni (diuji `node --test`).
 */

const SYMBOLS: Record<string, string> = {
  times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', ne: '≠',
  approx: '≈', equiv: '≡', infty: '∞', to: '→', rightarrow: '→', Rightarrow: '⇒', leftarrow: '←', implies: '⇒',
  sum: 'Σ', prod: 'Π', int: '∫', partial: '∂', nabla: '∇', in: '∈', notin: '∉', subset: '⊂', cup: '∪', cap: '∩',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ',
  pi: 'π', sigma: 'σ', Sigma: 'Σ', phi: 'φ', omega: 'ω', Omega: 'Ω', circ: '°', degree: '°', ldots: '…', dots: '…',
  cdots: '⋯', quad: '  ', qquad: '    ', percent: '%',
};
const SUPERSCRIPT: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '⁺', n: 'ⁿ' };

/** Satu ekspresi LaTeX → teks biasa. */
export function latexToText(expr: string): string {
  let s = expr.trim();
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = s
      .replace(/\\(?:text|mathrm|mathbf|textbf|mathit|operatorname|mbox)\s*\{([^{}]*)\}/g, '$1')
      .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a: string, b: string) =>
        `${/^[\w.,]+$/.test(a) ? a : `(${a})`}/${/^[\w.,]+$/.test(b) ? b : `(${b})`}`
      )
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, (_, a: string) => (/^[\w.,]+$/.test(a) ? `√${a}` : `√(${a})`));
    if (s === before) break;
  }
  return s
    .replace(/\^\s*\{?\s*\\circ\s*\}?\s*/g, ' °')
    .replace(/\{,\}/g, ',')
    .replace(/\{\.\}/g, '.')
    .replace(/\\left|\\right/g, '')
    .replace(/\\[,;:!]/g, ' ')
    .replace(/\\([%$&#_{}])/g, '$1')
    .replace(/\\([A-Za-z]+)/g, (_, name: string) => SYMBOLS[name] ?? name)
    .replace(/\^\{([0-9n+-]+)\}|\^([0-9n])/g, (m, a?: string, b?: string) => {
      const sup = [...(a ?? b ?? '')].map((c) => SUPERSCRIPT[c]);
      return sup.every(Boolean) ? sup.join('') : m;
    })
    .replace(/[{}]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+°/g, ' °')
    .trim();
}

/** Mengganti rumus LaTeX ber-pembatas di Markdown dengan teks biasa; blok/inline code dibiarkan. */
export function normalizeLatexMath(markdown: string): string {
  if (!/\\\(|\\\[|\$\$/.test(markdown)) return markdown;
  // Pisahkan blok kode berpagar & inline code agar isinya tidak diubah.
  return markdown
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .replace(/\$\$([\s\S]+?)\$\$/g, (_, e: string) => latexToText(e))
            .replace(/\\\[([\s\S]+?)\\\]/g, (_, e: string) => latexToText(e))
            .replace(/\\\(([\s\S]+?)\\\)/g, (_, e: string) => latexToText(e))
    )
    .join('');
}
