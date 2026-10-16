//! Jembatan izin Chat GUI (HITL): MCP server HTTP lokal yang dipakai Claude Code lewat
//! `--permission-prompt-tool`. Tiap permintaan izin diteruskan ke UI sebagai event
//! `agent:permission_request`, lalu dijawab pengguna lewat `approve_human_in_the_loop`.
//! Kontrak: specs/ipc-contracts.md §2 & §6, alur: specs/agent-protocols.md §7.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;

/// Nama tool MCP; Claude memanggilnya sebagai `mcp__soraja__approval_prompt`.
const TOOL_NAME: &str = "approval_prompt";
/// Pesan penolakan; frontend mengenali "ditolak oleh pengguna" sebagai keputusan pengguna (bukan mode aman).
const DENY_MESSAGE: &str = "Ditolak oleh pengguna di Soraja.";
/// Komentar SSE berkala agar koneksi HTTP tidak dianggap macet selama pengguna berpikir.
const KEEPALIVE: Duration = Duration::from_secs(15);
const MAX_BODY: usize = 4 * 1024 * 1024;

struct Pending {
    session_id: String,
    reply: oneshot::Sender<bool>,
}

/// Permintaan izin yang menunggu jawaban, per `tool_use_id` (dibagi antara command & server HTTP).
#[derive(Default)]
struct Shared {
    pending: Mutex<HashMap<String, Pending>>,
    counter: AtomicU64,
}

impl Shared {
    fn insert(&self, request_id: String, pending: Pending) {
        if let Ok(mut map) = self.pending.lock() {
            map.insert(request_id, pending);
        }
    }

    fn take(&self, request_id: &str) -> Option<Pending> {
        self.pending.lock().ok()?.remove(request_id)
    }
}

/// Penerus event `agent:permission_request` ke UI (dipisah dari `AppHandle` agar server bisa diuji).
type Notify = Arc<dyn Fn(Value) + Send + Sync>;

#[derive(Default)]
pub struct PermissionBridge {
    /// `(port, token)` setelah server berjalan; token acak mencegah proses lain memakai jembatan ini.
    endpoint: tokio::sync::Mutex<Option<(u16, String)>>,
    shared: Arc<Shared>,
}

/// Membatalkan semua permintaan izin milik sesi yang sudah berakhir (dijawab "tolak").
pub fn cancel_session(app: &AppHandle, session_id: &str) {
    if let Some(bridge) = app.try_state::<PermissionBridge>() {
        if let Ok(mut map) = bridge.shared.pending.lock() {
            map.retain(|_, p| p.session_id != session_id);
        }
    }
}

/// Mengembalikan URL MCP jembatan izin untuk satu sesi Chat GUI (server dinyalakan saat pertama dipakai).
#[tauri::command]
pub async fn prepare_permission_bridge(app: AppHandle, session_id: String) -> Result<String, String> {
    let (port, token) = ensure_endpoint(&app).await?;
    Ok(format!("http://127.0.0.1:{port}/mcp/{token}/{session_id}"))
}

/// Keputusan pengguna atas modal HITL Chat GUI: diteruskan ke CLI yang sedang menunggu.
#[tauri::command]
pub fn approve_human_in_the_loop(
    bridge: State<'_, PermissionBridge>,
    session_id: String,
    tool_call_id: String,
    approved: bool,
) -> Result<(), String> {
    match bridge.shared.take(&tool_call_id) {
        Some(p) if p.session_id == session_id => {
            let _ = p.reply.send(approved);
            Ok(())
        }
        Some(p) => {
            bridge.shared.insert(tool_call_id, p);
            Err("Permintaan izin ini milik sesi agen lain.".into())
        }
        None => Err("Permintaan izin sudah tidak aktif (sesi agen telah berakhir).".into()),
    }
}

async fn ensure_endpoint(app: &AppHandle) -> Result<(u16, String), String> {
    let bridge = app.state::<PermissionBridge>();
    let mut endpoint = bridge.endpoint.lock().await;
    if let Some(ep) = endpoint.clone() {
        return Ok(ep);
    }
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Jembatan izin gagal dibuka: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let token = random_token();
    let app_emit = app.clone();
    let notify: Notify = Arc::new(move |payload| {
        let _ = app_emit.emit("agent:permission_request", payload);
    });
    spawn_server(listener, bridge.shared.clone(), token.clone(), notify);
    *endpoint = Some((port, token.clone()));
    Ok((port, token))
}

fn spawn_server(listener: TcpListener, shared: Arc<Shared>, token: String, notify: Notify) {
    tokio::spawn(async move {
        while let Ok((stream, _)) = listener.accept().await {
            let (shared, token, notify) = (shared.clone(), token.clone(), notify.clone());
            tokio::spawn(async move {
                let _ = handle_connection(stream, &shared, &token, &notify).await;
            });
        }
    });
}

/// Token 128-bit dari `RandomState` (kunci acak OS per proses) tanpa dependensi tambahan.
fn random_token() -> String {
    use std::hash::{BuildHasher, Hasher};
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    (0u8..2)
        .map(|i| {
            let mut h = std::collections::hash_map::RandomState::new().build_hasher();
            h.write_u128(nanos);
            h.write_u32(std::process::id());
            h.write_u8(i);
            format!("{:016x}", h.finish())
        })
        .collect()
}

struct HttpRequest {
    method: String,
    path: String,
    body: Vec<u8>,
}

async fn read_request(reader: &mut BufReader<TcpStream>) -> std::io::Result<Option<HttpRequest>> {
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).await? == 0 {
        return Ok(None);
    }
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default().to_string();
    let path = parts.next().unwrap_or_default().to_string();
    let mut content_length = 0usize;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).await? == 0 || line.trim_end().is_empty() {
            break;
        }
        if let Some((key, value)) = line.split_once(':') {
            if key.trim().eq_ignore_ascii_case("content-length") {
                content_length = value.trim().parse().unwrap_or(0);
            }
        }
    }
    if content_length > MAX_BODY {
        return Ok(None);
    }
    let mut body = vec![0u8; content_length];
    reader.read_exact(&mut body).await?;
    Ok(Some(HttpRequest { method, path, body }))
}

async fn respond(stream: &mut TcpStream, status: &str, content_type: &str, body: &str) -> std::io::Result<()> {
    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(head.as_bytes()).await?;
    stream.write_all(body.as_bytes()).await?;
    stream.shutdown().await
}

/// MCP Streamable HTTP minimal: satu permintaan JSON-RPC per koneksi. `tools/call` dijawab lewat SSE
/// agar bisa menunggu keputusan pengguna selama apa pun tanpa kena batas waktu HTTP klien.
async fn handle_connection(stream: TcpStream, shared: &Shared, token: &str, notify: &Notify) -> std::io::Result<()> {
    let mut reader = BufReader::new(stream);
    let request = read_request(&mut reader).await?;
    let mut stream = reader.into_inner();
    let Some(req) = request else {
        return respond(&mut stream, "400 Bad Request", "text/plain", "").await;
    };
    let session_id = match req.path.strip_prefix("/mcp/").and_then(|rest| rest.split_once('/')) {
        Some((t, sid)) if t == token && !sid.is_empty() => sid.to_string(),
        _ => return respond(&mut stream, "404 Not Found", "text/plain", "").await,
    };
    if req.method != "POST" {
        return respond(&mut stream, "405 Method Not Allowed", "text/plain", "").await;
    }
    let Ok(msg) = serde_json::from_slice::<Value>(&req.body) else {
        return respond(&mut stream, "400 Bad Request", "text/plain", "").await;
    };
    // Notifikasi JSON-RPC (tanpa id) tidak butuh jawaban.
    let Some(id) = msg.get("id").cloned() else {
        return respond(&mut stream, "202 Accepted", "text/plain", "").await;
    };
    let result = match msg["method"].as_str().unwrap_or_default() {
        "tools/call" => return answer_tool_call(stream, shared, notify, session_id, id, &msg["params"]).await,
        "initialize" => json!({
            "protocolVersion": msg["params"]["protocolVersion"].as_str().unwrap_or("2025-06-18"),
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "soraja", "version": env!("CARGO_PKG_VERSION") },
        }),
        "tools/list" => json!({ "tools": [tool_definition()] }),
        _ => json!({}),
    };
    let body = json!({ "jsonrpc": "2.0", "id": id, "result": result }).to_string();
    respond(&mut stream, "200 OK", "application/json", &body).await
}

fn tool_definition() -> Value {
    json!({
        "name": TOOL_NAME,
        "description": "Meminta persetujuan pengguna Soraja sebelum agen menjalankan tool.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "tool_name": { "type": "string" },
                "input": { "type": "object" },
                "tool_use_id": { "type": "string" }
            },
            "required": ["tool_name", "input"]
        }
    })
}

async fn answer_tool_call(
    mut stream: TcpStream,
    shared: &Shared,
    notify: &Notify,
    session_id: String,
    id: Value,
    params: &Value,
) -> std::io::Result<()> {
    let args = &params["arguments"];
    let tool_name = args["tool_name"].as_str().unwrap_or("tool").to_string();
    let input = args.get("input").cloned().unwrap_or_else(|| json!({}));
    let request_id = args["tool_use_id"]
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| format!("izin-{}", shared.counter.fetch_add(1, Ordering::Relaxed)));

    let (reply, mut decision) = oneshot::channel();
    shared.insert(request_id.clone(), Pending { session_id: session_id.clone(), reply });
    notify(json!({ "sessionId": session_id, "requestId": request_id, "toolName": tool_name, "input": input }));

    stream
        .write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n: menunggu\n\n")
        .await?;
    let approved = loop {
        tokio::select! {
            // Pengirim dibuang (sesi berakhir) = tolak.
            res = &mut decision => break res.unwrap_or(false),
            _ = tokio::time::sleep(KEEPALIVE) => {
                if stream.write_all(b": ping\n\n").await.is_err() {
                    // CLI sudah putus (mis. dihentikan): permintaan dibuang.
                    shared.take(&request_id);
                    return Ok(());
                }
            }
        }
    };

    let verdict = if approved {
        json!({ "behavior": "allow", "updatedInput": input })
    } else {
        json!({ "behavior": "deny", "message": DENY_MESSAGE })
    };
    let rpc = json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": { "content": [{ "type": "text", "text": verdict.to_string() }] },
    });
    stream.write_all(format!("event: message\ndata: {rpc}\n\n").as_bytes()).await?;
    stream.shutdown().await
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn start(decision: Option<bool>) -> (u16, Arc<Shared>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let shared = Arc::new(Shared::default());
        let answerer = shared.clone();
        // Meniru UI: menjawab setiap permintaan izin begitu event diterima.
        let notify: Notify = Arc::new(move |payload: Value| {
            if let Some(approved) = decision {
                let pending = answerer.take(payload["requestId"].as_str().unwrap()).unwrap();
                assert_eq!(pending.session_id, "agt-1");
                let _ = pending.reply.send(approved);
            }
        });
        spawn_server(listener, shared.clone(), "tok".into(), notify);
        (port, shared)
    }

    async fn post(port: u16, path: &str, body: &str) -> String {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        let req = format!(
            "POST {path} HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nConnection: keep-alive\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        );
        stream.write_all(req.as_bytes()).await.unwrap();
        let mut out = String::new();
        stream.read_to_string(&mut out).await.unwrap();
        out
    }

    const CALL: &str = r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"approval_prompt","arguments":{"tool_name":"Bash","input":{"command":"npm test"},"tool_use_id":"toolu_1"}}}"#;
    const DENY: &str = r#"\"behavior\":\"deny\""#;

    #[tokio::test]
    async fn handshake_dan_token() {
        let (port, _) = start(None).await;
        let init = post(port, "/mcp/tok/agt-1", r#"{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-11-25"}}"#).await;
        assert!(init.starts_with("HTTP/1.1 200"));
        assert!(init.contains(r#""protocolVersion":"2025-11-25""#));
        let list = post(port, "/mcp/tok/agt-1", r#"{"jsonrpc":"2.0","id":1,"method":"tools/list"}"#).await;
        assert!(list.contains(r#""name":"approval_prompt""#));
        let note = post(port, "/mcp/tok/agt-1", r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#).await;
        assert!(note.starts_with("HTTP/1.1 202"));
        assert!(post(port, "/mcp/salah/agt-1", "{}").await.starts_with("HTTP/1.1 404"));
    }

    #[tokio::test]
    async fn izin_diteruskan_lewat_sse() {
        let (port, shared) = start(Some(true)).await;
        let res = post(port, "/mcp/tok/agt-1", CALL).await;
        assert!(res.contains("Content-Type: text/event-stream"));
        let data = res.lines().find_map(|l| l.strip_prefix("data: ")).unwrap();
        let rpc: Value = serde_json::from_str(data).unwrap();
        assert_eq!(rpc["id"], 2);
        let verdict: Value = serde_json::from_str(rpc["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
        assert_eq!(verdict, json!({ "behavior": "allow", "updatedInput": { "command": "npm test" } }));
        assert!(shared.pending.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn tolak_dan_sesi_berakhir() {
        let (port, _) = start(Some(false)).await;
        let res = post(port, "/mcp/tok/agt-1", CALL).await;
        assert!(res.contains(DENY));
        assert!(res.contains("Ditolak oleh pengguna di Soraja."));

        // Tanpa jawaban: sesi berakhir → pengirim dibuang → CLI menerima "tolak".
        let (port, shared) = start(None).await;
        let call = tokio::spawn(async move { post(port, "/mcp/tok/agt-1", CALL).await });
        while shared.pending.lock().unwrap().is_empty() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        shared.pending.lock().unwrap().retain(|_, p| p.session_id != "agt-1");
        assert!(call.await.unwrap().contains(DENY));
    }
}
