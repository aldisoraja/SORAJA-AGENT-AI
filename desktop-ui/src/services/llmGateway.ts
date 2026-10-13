import type { AgentProvider, ModelItem, IntelligentAgentResult } from '../types/agent';
import type { TrajectoryStep } from '../types/database';


/**
 * Calls Anthropic Claude API with RAG Augmented Context.
 */
async function callClaudeApi(
  apiKey: string,
  modelId: string,
  prompt: string,
  ragContext: string,
  systemPersona: string
): Promise<IntelligentAgentResult | null> {
  // Pakai slug resmi dari katalog /model; tebakan hanya untuk id yang bukan slug Claude.
  const claudeModel = /^claude-(opus|sonnet|haiku|fable)-\d/.test(modelId)
    ? modelId
    : modelId.includes('opus')
    ? 'claude-opus-5-5'
    : modelId.includes('haiku')
    ? 'claude-haiku-5-5'
    : 'claude-sonnet-5-5';

  const systemPrompt = `${systemPersona}\n\n${ragContext}\n\nInstruksi Tambahan: Jawablah dengan 100% akurat berbasis fakta dari berkas di atas.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'dangerously-allow-browser': 'true',
      },
      body: JSON.stringify({
        model: claudeModel,
        max_tokens: 3500,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const textContent = data.content?.[0]?.text || '';

    const trajectory: TrajectoryStep[] = [
      { type: 'thought', label: `Penalaran Claude (${claudeModel}) dengan RAG Grounding` },
      { type: 'explored', label: 'Menganalisis Top-K konteks berkas proyek' },
    ];

    return {
      content: textContent,
      reasoning: `[Anthropic Claude Engine - ${claudeModel}]\n1. RAG Grounding: Menginjeksikan Top-K konteks berkas proyek aktif.\n2. Inferensi: Berhasil mendapatkan respon faktual langsung dari model Claude API.`,
      trajectory,
    };
  } catch (err) {
    console.warn('Anthropic API call error:', err);
    return null;
  }
}

/**
 * Calls OpenAI API (Codex/GPT) with RAG Augmented Context.
 */
async function callOpenAiApi(
  apiKey: string,
  modelId: string,
  prompt: string,
  ragContext: string,
  systemPersona: string
): Promise<IntelligentAgentResult | null> {
  const openAiModel = modelId.includes('o3')
    ? 'o3-mini'
    : modelId.includes('o1')
    ? 'o1-mini'
    : 'gpt-4o';

  const messages = [
    {
      role: 'system',
      content: `${systemPersona}\n\n${ragContext}\n\nInstruksi Tambahan: Jawablah dengan 100% akurat berbasis fakta dari berkas di atas.`,
    },
    { role: 'user', content: prompt },
  ];

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: openAiModel,
        messages,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const textContent = data.choices?.[0]?.message?.content || '';

    const trajectory: TrajectoryStep[] = [
      { type: 'thought', label: `Penalaran OpenAI (${openAiModel}) dengan RAG Grounding` },
      { type: 'explored', label: 'Menganalisis Top-K konteks berkas proyek' },
    ];

    return {
      content: textContent,
      reasoning: `[OpenAI Engine - ${openAiModel}]\n1. RAG Grounding: Menginjeksikan Top-K konteks berkas proyek aktif.\n2. Inferensi: Berhasil mendapatkan respon faktual langsung dari OpenAI API.`,
      trajectory,
    };
  } catch (err) {
    console.warn('OpenAI API call error:', err);
    return null;
  }
}

/**
 * Calls Local Ollama / OpenCode API with RAG Augmented Context.
 */
async function callLocalOllamaApi(
  modelId: string,
  prompt: string,
  ragContext: string,
  systemPersona: string
): Promise<IntelligentAgentResult | null> {
  try {
    const res = await fetch('http://localhost:11434/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId.includes('deepseek') ? 'deepseek-r1:latest' : 'qwen2.5-coder:latest',
        messages: [
          { role: 'system', content: `${systemPersona}\n\n${ragContext}` },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const textContent = data.choices?.[0]?.message?.content || '';

    return {
      content: textContent,
      reasoning: `[OpenCode Local Engine - Ollama]\n1. RAG Grounding: Konteks lokal terinjeksi.\n2. Inferensi: Dihasilkan dari model open-weights lokal.`,
      trajectory: [{ type: 'thought', label: 'Inferensi model lokal Ollama' }],
    };
  } catch {
    return null;
  }
}

/**
 * Universal Multi-Provider LLM Gateway with Grounded RAG Pipeline.
 */
export async function executeMultiProviderRagLlm(
  agent: AgentProvider,
  model: ModelItem,
  apiKey: string,
  prompt: string,
  ragContext: string,
  systemPersona: string
): Promise<IntelligentAgentResult | null> {
  if (agent.id === 'claude' && apiKey) {
    return await callClaudeApi(apiKey, model.id, prompt, ragContext, systemPersona);
  }

  if (agent.id === 'codex' && apiKey) {
    return await callOpenAiApi(apiKey, model.id, prompt, ragContext, systemPersona);
  }

  if (agent.id === 'opencode') {
    return await callLocalOllamaApi(model.id, prompt, ragContext, systemPersona);
  }

  return null;
}
