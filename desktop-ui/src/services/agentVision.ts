import type { AttachedFile } from '../types/database';
import type { AgentProvider } from '../types/agent';

export interface VisionApiResult {
  success: boolean;
  content: string;
  reasoning: string;
  apiError?: string;
}

/**
 * Direct call to Google Gemini REST API with Multimodal Vision capability.
 */
export async function callGeminiVisionApi(
  apiKey: string,
  modelName: string,
  prompt: string,
  imageAttachments: AttachedFile[]
): Promise<VisionApiResult> {
  const trimmedKey = apiKey.trim();

  if (!trimmedKey.startsWith('AIzaSy')) {
    return {
      success: false,
      content: '',
      reasoning: 'Kredensial tersimpan bukan format API Key resmi Google AI Studio (kunci resmi diawali "AIzaSy...").',
      apiError: 'Kunci yang dimasukkan tidak diawali dengan "AIzaSy...". Pastikan menggunakan API Key dari Google AI Studio, bukan password akun Google.',
    };
  }

  try {
    const parts: any[] = [];
    parts.push({
      text: prompt || 'Analisis dan jelaskan detail isi gambar ini secara mendalam dalam bahasa Indonesia.',
    });

    for (const img of imageAttachments) {
      if ((img.dataUrl || img.previewUrl) && (img.dataUrl || img.previewUrl)!.startsWith('data:')) {
        const mimeMatch = (img.dataUrl || img.previewUrl)!.match(/data:([^;]+);base64,(.+)/);
        if (mimeMatch) {
          parts.push({
            inlineData: {
              mimeType: mimeMatch[1],
              data: mimeMatch[2],
            },
          });
        }
      }
    }

    const candidateModels = modelName.includes('pro')
      ? ['gemini-2.5-pro', 'gemini-1.5-pro']
      : ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

    let lastError = '';

    for (const targetModel of candidateModels) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${trimmedKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts }],
            }),
          }
        );

        if (response.ok) {
          const json = await response.json();
          const candidate = json.candidates?.[0];
          const text = candidate?.content?.parts?.[0]?.text;

          if (text) {
            return {
              success: true,
              content: text,
              reasoning: `1. Pemanggilan Multimodal Live API: Berhasil terhubung ke endpoint ${targetModel} via Google Gemini Vision API.
2. Analisis Visual Berkas: Menganalisis ${imageAttachments.length} berkas gambar yang dikirimkan.
3. Ekstraksi Fitur & Semantic Parsing: Mengekstrak teks, komponen visual, tata letak, dan detail arsitektur antarmuka secara real-time.
4. Output Visi Lengkap: Menyajikan pemahaman visual langsung dari Google DeepMind Vision Engine.`,
            };
          }
        } else {
          const errJson = await response.json().catch(() => null);
          lastError = errJson?.error?.message || `HTTP ${response.status} ${response.statusText}`;
          if (response.status === 400 || response.status === 403) {
            break;
          }
        }
      } catch (err: any) {
        lastError = err?.message || 'Network error';
      }
    }

    return {
      success: false,
      content: '',
      reasoning: `Pemanggilan Google Gemini Cloud API mengalami kendala: ${lastError}`,
      apiError: lastError,
    };
  } catch (err: any) {
    return {
      success: false,
      content: '',
      reasoning: `Error eksekusi Vision API: ${err?.message || 'Unknown error'}`,
      apiError: err?.message || 'Unknown error',
    };
  }
}

/**
 * Fallback tanpa model multimodal: isi piksel gambar TIDAK bisa dibaca di sini, jadi tidak ada
 * "analisis" palsu berbasis kata kunci. Fungsi ini jujur soal batasan itu, lalu menyertakan jawaban
 * kontekstual atas teks pertanyaan pengguna (`textAnswer`, disusun oleh agentContextualAnswers).
 */
export function analyzeImageContextually(
  prompt: string,
  imageAttachments: AttachedFile[],
  agent: AgentProvider,
  apiErrorNote?: string,
  textAnswer?: string
): string {
  const fileNames = imageAttachments.map((img) => `\`${img.name}\``).join(', ');
  const why = apiErrorNote ? `\n> ⚠️ ${apiErrorNote}` : '';
  const answer = textAnswer ?? (prompt ? `Pertanyaan Anda: *"${prompt}"*` : '');

  return `📎 Lampiran diterima: ${fileNames || 'gambar'}. Tanpa model multimodal yang aktif, isi gambar belum bisa saya baca — jadi saya tidak akan menebak apa yang tampak di dalamnya.${why}

Agar gambar benar-benar dianalisis, kirim ulang saat CLI **${agent.name}** aktif, atau tambahkan API Key Google AI Studio di Pengaturan ➔ Kredensial Model.

---

${answer}`;
}
