use anyhow::Result;
use futures::Stream;
use std::pin::Pin;

use crate::models::LlmStreamChunk;

/// Tipe alias: Stream Asinkron yang menghasilkan rentetan token LLM.
/// Wajib thread-safe (Send) karena agen berjalan di multithreading Tokio.
pub type LlmStream = Pin<Box<dyn Stream<Item = Result<LlmStreamChunk>> + Send>>;

/// Trait / Kontrak Utama untuk semua penyedia model LLM
pub trait LlmProvider: Send + Sync {
    /// Mengirimkan prompt dan langsung me-return SSE (Server-Sent Events) Stream.
    fn stream_chat(&self, prompt: &str, session_id: &str) -> Result<LlmStream>;
}

/// Implementasi Spesifik untuk Provider Google Gemini
pub mod gemini {
    use super::*;
    use async_stream::stream;

    #[allow(dead_code)]
    pub struct GeminiAdapter {
        api_key: String,
        model_name: String,
    }

    impl GeminiAdapter {
        pub fn new(api_key: String, model_name: String) -> Self {
            Self { api_key, model_name }
        }
    }

    impl LlmProvider for GeminiAdapter {
        fn stream_chat(&self, _prompt: &str, session_id: &str) -> Result<LlmStream> {
            let session = session_id.to_string();
            
            // Mengembalikan Stream menggunakan generator (dummy simulasi untuk sementara)
            // TODO: Integrasi native HTTP reqwest + eventsource-stream di Fase 3
            let stream = stream! {
                yield Ok(LlmStreamChunk {
                    session_id: session,
                    content: "[Gemini Adapter]: Menyambungkan ke SSE endpoint...\n".to_string(),
                    is_reasoning: false,
                });
            };

            Ok(Box::pin(stream))
        }
    }
}
