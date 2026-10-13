import { readWorkspaceFile } from './workspaceFileService';

export interface RagChunk {
  file: string;
  lineRange: string;
  startLine: number;
  endLine: number;
  content: string;
  symbols: string[];
}

export interface RagRetrievalResult {
  topChunks: RagChunk[];
  augmentedContext: string;
  referencedFiles: string[];
  totalChunksSearched: number;
}

/**
 * Extracts key code symbols (functions, classes, interfaces, structs) from a line.
 */
function extractSymbols(line: string): string[] {
  const symbols: string[] = [];
  const patterns = [
    /(?:function|class|interface|type|enum|const|let)\s+([a-zA-Z0-9_]+)/g,
    /(?:fn|struct|impl|trait|enum)\s+([a-zA-Z0-9_]+)/g,
  ];

  for (const pat of patterns) {
    let match;
    while ((match = pat.exec(line)) !== null) {
      if (match[1]) symbols.push(match[1].toLowerCase());
    }
  }
  return symbols;
}

/**
 * Chunks a single file's text into logical segments with line numbers and symbols.
 */
export function chunkFileContent(file: string, content: string, chunkSize = 35): RagChunk[] {
  const lines = content.split('\n');
  const chunks: RagChunk[] = [];

  for (let i = 0; i < lines.length; i += chunkSize) {
    const slice = lines.slice(i, i + chunkSize);
    const startLine = i + 1;
    const endLine = Math.min(i + chunkSize, lines.length);
    const chunkText = slice.join('\n');

    const symbols: string[] = [];
    slice.forEach((l) => symbols.push(...extractSymbols(l)));

    chunks.push({
      file,
      lineRange: `#L${startLine}-${endLine}`,
      startLine,
      endLine,
      content: chunkText,
      symbols: Array.from(new Set(symbols)),
    });
  }

  return chunks;
}

/**
 * Tokenizes user query into normalized keyword terms (ignoring stop words).
 */
function tokenizeQuery(query: string): string[] {
  const stopWords = new Set([
    'apa', 'itu', 'di', 'ke', 'dari', 'yang', 'dan', 'ini', 'itu', 'pada', 'untuk',
    'bisa', 'tolong', 'buat', 'bagaimana', 'the', 'is', 'in', 'at', 'of', 'and', 'a', 'to',
  ]);

  return query
    .toLowerCase()
    .replace(/[^a-zA-Z0-9_\-\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w));
}

/**
 * Performs Semantic & Keyword Search + Reranking to find Top-K most relevant chunks.
 * Replicates the Antigravity RAG Retrieval pipeline from local repository files.
 */
export async function retrieveTopKContext(
  query: string,
  workspaceFiles: string[],
  projectPath: string,
  topK = 4
): Promise<RagRetrievalResult> {
  const queryTerms = tokenizeQuery(query);
  const lowerQuery = query.toLowerCase();

  // Prioritize meaningful code and spec files
  const priorityFiles = workspaceFiles.filter((f) => {
    const ext = f.split('.').pop()?.toLowerCase();
    return ['rs', 'ts', 'tsx', 'md', 'toml', 'json', 'sql', 'css'].includes(ext || '');
  });

  const allChunks: RagChunk[] = [];
  const sampleFiles = priorityFiles.slice(0, 25); // inspect up to 25 relevant files

  for (const relPath of sampleFiles) {
    try {
      const text = await readWorkspaceFile(projectPath, relPath);
      if (text && text.trim().length > 0) {
        allChunks.push(...chunkFileContent(relPath, text, 35));
      }
    } catch {
      // skip unreadable file
    }
  }

  // Score each chunk
  const scoredChunks = allChunks.map((chunk) => {
    let score = 0;
    const lowerFile = chunk.file.toLowerCase();
    const lowerContent = chunk.content.toLowerCase();

    // 1. Direct file name relevance
    for (const term of queryTerms) {
      if (lowerFile.includes(term)) {
        score += 15;
      }
    }

    // 2. Exact phrase match in content
    if (lowerContent.includes(lowerQuery)) {
      score += 25;
    }

    // 3. Keyword and Symbol occurrences
    for (const term of queryTerms) {
      if (chunk.symbols.includes(term)) {
        score += 20; // High weight for symbol matching (function/struct/interface)
      }

      const matches = lowerContent.split(term).length - 1;
      if (matches > 0) {
        score += Math.min(matches * 3, 15);
      }
    }

    // Bonus for important entrypoints or specs if query asks architecture
    if (
      (lowerQuery.includes('struktur') || lowerQuery.includes('arsitektur') || lowerQuery.includes('rag')) &&
      (lowerFile.includes('readme') || lowerFile.includes('specs') || lowerFile.includes('main.rs'))
    ) {
      score += 10;
    }

    return { chunk, score };
  });

  // Sort descending by score
  scoredChunks.sort((a, b) => b.score - a.score);

  const top = scoredChunks.filter((c) => c.score > 0).slice(0, topK).map((c) => c.chunk);
  const topChunks = top.length > 0 ? top : allChunks.slice(0, Math.min(topK, allChunks.length));

  const referencedFiles = Array.from(new Set(topChunks.map((c) => c.file)));

  // Build Augmented Prompt Context (Injection)
  const contextParts = topChunks.map((c) => {
    return `[BERKAS: ${c.file} ${c.lineRange}]\n\`\`\`\n${c.content}\n\`\`\``;
  });

  const augmentedContext =
    contextParts.length > 0
      ? `=== REPOSITORY GROUNDED KNOWLEDGE (RAG Top-K Context) ===\nBerikut adalah kutipan berkas riil dari workspace proyek aktif:\n\n${contextParts.join(
          '\n\n'
        )}\n==========================================================`
      : '';

  return {
    topChunks,
    augmentedContext,
    referencedFiles,
    totalChunksSearched: allChunks.length,
  };
}
