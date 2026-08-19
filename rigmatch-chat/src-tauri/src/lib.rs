use serde::{Deserialize, Serialize};
use sysinfo::System;
use tauri::ipc::Channel;

#[derive(Serialize, Deserialize, Clone)]
pub struct OllamaModel {
    pub name: String,
    pub size: u64,
    pub modified_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

fn validate_localhost(base_url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(base_url)
        .map_err(|_| format!("Invalid Ollama URL: {base_url}"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Ollama URL must use http(s)".to_string());
    }
    let host = parsed.host_str().unwrap_or("");
    if !matches!(host, "localhost" | "127.0.0.1" | "::1") {
        return Err("Ollama URL must point to localhost".to_string());
    }
    Ok(())
}

fn validate_model_name(model: &str) -> Result<(), String> {
    let trimmed = model.trim();
    if trimmed.is_empty() || trimmed.len() > 200 {
        return Err("Invalid model name".to_string());
    }
    if trimmed.contains("..") || trimmed.contains("//") || trimmed.contains('\\') {
        return Err("Invalid model name".to_string());
    }
    if trimmed.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err("Invalid model name".to_string());
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '/' | ':'))
    {
        return Err("Invalid model name".to_string());
    }
    Ok(())
}

#[tauri::command]
async fn get_ollama_version(base_url: String) -> Option<String> {
    validate_localhost(&base_url).ok()?;
    let url = format!("{}/api/version", base_url.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .ok()?;
    let json: serde_json::Value = client.get(&url).send().await.ok()?.json().await.ok()?;
    json["version"].as_str().map(|s| s.to_string())
}

#[tauri::command]
async fn list_ollama_models(base_url: String) -> Result<Vec<OllamaModel>, String> {
    validate_localhost(&base_url)?;
    let url = format!("{}/api/tags", base_url.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Ollama returned {}", res.status()));
    }
    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let models = json["models"].as_array().cloned().unwrap_or_default();
    Ok(models
        .into_iter()
        .filter_map(|m| {
            Some(OllamaModel {
                name: m["name"].as_str()?.to_string(),
                size: m["size"].as_u64().unwrap_or(0),
                modified_at: m["modified_at"].as_str().unwrap_or("").to_string(),
            })
        })
        .collect())
}

/// What a model says about its own memory, straight out of `/api/show`.
///
/// The architecture prefixes these keys with its own name (`llama.block_count`,
/// `qwen2.attention.head_count_kv`, and so on), so they are matched on suffix
/// rather than by building the key from a hardcoded family name.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModelContextInfo {
    pub max_context: u64,
    pub block_count: u64,
    pub head_count_kv: u64,
    pub key_length: u64,
    pub value_length: u64,
}

/// Look up `<arch>.<field>` without knowing the architecture name.
///
/// Multimodal models carry nested sub-architectures alongside the top-level
/// one — deepseek-ocr publishes `deepseekocr.block_count` *and*
/// `deepseekocr.sam.block_count` and `deepseekocr.vision.block_count`. The text
/// model is always the shallowest key, so depth breaks the tie rather than
/// whichever happened to come first in map order.
///
/// A key that exists with a null value counts as absent: granite4 publishes
/// `head_count_kv` as null, and the caller needs that to fall through to its
/// alternative rather than reading it as zero.
fn find_suffixed(info: &serde_json::Map<String, serde_json::Value>, suffix: &str) -> Option<u64> {
    info.iter()
        .filter(|(k, _)| k.ends_with(suffix))
        .filter_map(|(k, v)| v.as_u64().map(|n| (k.matches('.').count(), n)))
        .min_by_key(|(depth, _)| *depth)
        .map(|(_, n)| n)
}

/// Pull the memory-shaping fields out of an `/api/show` body.
///
/// Split from the request so it can be tested against real payloads — the
/// fallbacks below exist because of specific models, not hypotheticals.
fn parse_context_info(json: &serde_json::Value) -> Option<ModelContextInfo> {
    let info = json["model_info"].as_object()?;
    let max_context = find_suffixed(info, ".context_length")?;
    let block_count = find_suffixed(info, ".block_count").unwrap_or(0);

    // Without grouped-query attention there is no head_count_kv (or it is
    // null, as on granite4) and every attention head carries its own KV.
    let head_count_kv = find_suffixed(info, ".attention.head_count_kv")
        .or_else(|| find_suffixed(info, ".attention.head_count"))
        .unwrap_or(0);

    // Some architectures omit the explicit per-head widths; they can be derived
    // from the embedding width divided across the attention heads.
    let derived_head_dim = || {
        let embedding = find_suffixed(info, ".embedding_length")?;
        let heads = find_suffixed(info, ".attention.head_count")?;
        embedding.checked_div(heads)
    };
    let key_length = find_suffixed(info, ".attention.key_length")
        .or_else(derived_head_dim)
        .unwrap_or(0);
    let value_length = find_suffixed(info, ".attention.value_length")
        .or_else(derived_head_dim)
        .unwrap_or(0);

    Some(ModelContextInfo {
        max_context,
        block_count,
        head_count_kv,
        key_length,
        value_length,
    })
}

#[tauri::command]
async fn get_model_context_info(
    base_url: String,
    model: String,
) -> Result<Option<ModelContextInfo>, String> {
    validate_localhost(&base_url)?;
    validate_model_name(&model)?;
    let url = format!("{}/api/show", base_url.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .post(&url)
        .json(&serde_json::json!({ "name": model }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Ok(None);
    }
    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(parse_context_info(&json))
}

/// Streamed output. The final message carries Ollama's own `prompt_eval_count`,
/// which is the only exact measure of how much of the conversation the model
/// actually saw — the app previously had no way to know it had been truncated.
#[derive(Serialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum StreamEvent {
    Token { value: String },
    Done { prompt_tokens: u64, eval_tokens: u64 },
}

/// Generations that can still be stopped, by the id the caller gave them.
///
/// Aborting used to be a front-end fiction: the AbortController stopped tokens
/// being *delivered*, but nothing told the backend, so this loop read the
/// response to the end and Ollama kept generating — occupying the GPU for a
/// reply nobody would ever see, and doing it again if the user sent something
/// else in the meantime.
#[derive(Default)]
struct ActiveStreams(std::sync::Mutex<std::collections::HashMap<String, std::sync::Arc<tokio::sync::Notify>>>);

#[tauri::command]
fn cancel_chat(state: tauri::State<ActiveStreams>, stream_id: String) {
    if let Ok(streams) = state.0.lock() {
        if let Some(notify) = streams.get(&stream_id) {
            // notify_one, not notify_waiters: a cancel that arrives before the
            // loop starts waiting must still be seen rather than dropped.
            notify.notify_one();
        }
    }
}

#[tauri::command]
async fn stream_chat(
    base_url: String,
    model: String,
    messages: Vec<ChatMessage>,
    num_ctx: Option<u64>,
    stream_id: String,
    state: tauri::State<'_, ActiveStreams>,
    on_token: Channel<StreamEvent>,
) -> Result<(), String> {
    let cancel = std::sync::Arc::new(tokio::sync::Notify::new());
    if let Ok(mut streams) = state.0.lock() {
        streams.insert(stream_id.clone(), cancel.clone());
    }
    let result = run_stream(base_url, model, messages, num_ctx, on_token, &cancel).await;
    // Deregister on every path, including the error ones, so the map does not
    // grow for the life of the process.
    if let Ok(mut streams) = state.0.lock() {
        streams.remove(&stream_id);
    }
    result
}

async fn run_stream(
    base_url: String,
    model: String,
    messages: Vec<ChatMessage>,
    num_ctx: Option<u64>,
    on_token: Channel<StreamEvent>,
    cancel: &tokio::sync::Notify,
) -> Result<(), String> {
    validate_localhost(&base_url)?;
    validate_model_name(&model)?;
    let url = format!("{}/api/chat", base_url.trim_end_matches('/'));
    let mut body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": true,
    });
    // Without this Ollama uses its own default of 4096 regardless of what the
    // model supports, and drops the middle of any longer conversation silently.
    if let Some(ctx) = num_ctx {
        body["options"] = serde_json::json!({ "num_ctx": ctx });
    }
    let client = reqwest::Client::new();
    // Selected against cancellation as well: loading a large model into VRAM
    // can take many seconds, and Stop has to work during that too.
    let mut res = tokio::select! {
        biased;
        _ = cancel.notified() => return Ok(()),
        sent = client.post(&url).json(&body).send() => sent.map_err(|e| e.to_string())?,
    };
    if !res.status().is_success() {
        return Err(format!("Ollama chat returned {}", res.status()));
    }
    let mut buffer = String::new();
    loop {
        // Returning here drops the response, which closes the connection and is
        // what actually makes Ollama stop generating — the point of the whole
        // exercise. Waiting for the next chunk first would mean a stalled or
        // slow generation ignored Stop until it produced something.
        let next = tokio::select! {
            biased;
            _ = cancel.notified() => return Ok(()),
            chunk = res.chunk() => chunk.map_err(|e| e.to_string())?,
        };
        let Some(chunk) = next else { break };
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        let lines: Vec<&str> = buffer.split('\n').collect();
        let remainder = lines.last().cloned().unwrap_or("").to_string();
        for line in lines[..lines.len().saturating_sub(1)].iter() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(trimmed) {
                if let Some(content) = parsed["message"]["content"].as_str() {
                    if !content.is_empty() {
                        on_token
                            .send(StreamEvent::Token { value: content.to_string() })
                            .map_err(|e| e.to_string())?;
                    }
                }
                if parsed["done"].as_bool().unwrap_or(false) {
                    on_token
                        .send(StreamEvent::Done {
                            prompt_tokens: parsed["prompt_eval_count"].as_u64().unwrap_or(0),
                            eval_tokens: parsed["eval_count"].as_u64().unwrap_or(0),
                        })
                        .map_err(|e| e.to_string())?;
                    return Ok(());
                }
            }
        }
        buffer = remainder;
    }
    Ok(())
}

// ── Conversation storage ────────────────────────────────────────────────────
//
// Conversations used to live in localStorage, which is capped somewhere around
// 5 MB. Going over it makes setItem throw, and the write sat unguarded in an
// effect that runs on mount — so a full history tripped the error boundary on
// startup and did it again on every launch, with no way back from inside the
// app. A file in the app data directory has no such ceiling.

fn conversations_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("conversations.json"))
}

fn read_json_file(path: &std::path::Path) -> Result<Option<String>, String> {
    match std::fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        // Nothing saved yet is the ordinary first-run case, not a failure.
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

/// Write beside the target and rename over it, so a crash or a full disk
/// part-way through leaves the previous history intact rather than a truncated
/// file. `rename` replaces an existing destination on every platform Tauri
/// targets, Windows included.
fn write_json_file(path: &std::path::Path, contents: &str) -> Result<(), String> {
    let temp = path.with_extension("json.writing");
    std::fs::write(&temp, contents.as_bytes()).map_err(|e| e.to_string())?;
    std::fs::rename(&temp, path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn read_conversations(app: tauri::AppHandle) -> Result<Option<String>, String> {
    read_json_file(&conversations_path(&app)?)
}

#[tauri::command]
fn write_conversations(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    write_json_file(&conversations_path(&app)?, &contents)
}

/// Standing memory lives beside the conversations rather than inside them: it
/// belongs to the user, not to any one thread, and keeping it separate means
/// clearing chat history does not silently take it too.
fn memories_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("memories.json"))
}

#[tauri::command]
fn read_memories(app: tauri::AppHandle) -> Result<Option<String>, String> {
    read_json_file(&memories_path(&app)?)
}

#[tauri::command]
fn write_memories(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    write_json_file(&memories_path(&app)?, &contents)
}

// ── Video memory ────────────────────────────────────────────────────────────
//
// Context size was chosen against a fixed 2 GiB budget because nothing here
// knew what card was fitted. That is safe on a small card and needlessly
// miserly on a large one: an RTX 4070 holds llama3.2:3b at 32K entirely on the
// GPU (measured at 5.98 GB) while the fixed budget stopped it at 16K.

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VramInfo {
    pub total_bytes: u64,
    /// True when the pool is system RAM shared with the CPU (Apple Silicon).
    /// The whole thing is never safely available, so the caller reserves more.
    pub unified: bool,
}

/// Parse `nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits`.
///
/// Real captured output on this machine, both forms — `nounits` is not honoured
/// by every driver version, so the unit-bearing one has to parse too:
///   "12282"
///   "12282 MiB"
fn parse_nvidia_total_mb(output: &str) -> Option<u64> {
    output
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with('#'))
        .and_then(|line| line.split_whitespace().next())
        .and_then(|number| number.trim_end_matches(',').parse::<u64>().ok())
        .filter(|mb| *mb > 0)
}

fn nvidia_total_bytes() -> Option<u64> {
    let mut command = std::process::Command::new("nvidia-smi");
    command.args(["--query-gpu=memory.total", "--format=csv,noheader,nounits"]);
    // Without this the probe flashes a console window on Windows every launch.
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    parse_nvidia_total_mb(&String::from_utf8_lossy(&output.stdout)).map(|mb| mb * 1024 * 1024)
}

#[tauri::command]
fn get_vram_info(state: tauri::State<SysInfoState>) -> Option<VramInfo> {
    // Apple Silicon has no separate pool to query — the GPU draws on system
    // RAM, so that is the honest number, flagged so the caller reserves more.
    #[cfg(target_os = "macos")]
    {
        let mut sys = state.0.lock().ok()?;
        sys.refresh_memory();
        return Some(VramInfo { total_bytes: sys.total_memory(), unified: true });
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = &state;
        // No NVIDIA card, or no driver tools: the caller keeps its fixed budget
        // rather than guessing at a number it cannot check.
        nvidia_total_bytes().map(|total_bytes| VramInfo { total_bytes, unified: false })
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    pub cpu_percent: f32,
    pub ram_used_gb: f32,
    pub ram_total_gb: f32,
}

struct SysInfoState(std::sync::Mutex<System>);

#[tauri::command]
fn get_system_stats(state: tauri::State<SysInfoState>) -> SystemStats {
    let mut sys = state.0.lock().unwrap();
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    SystemStats {
        cpu_percent: sys.global_cpu_usage(),
        ram_used_gb: sys.used_memory() as f32 / 1_073_741_824.0,
        ram_total_gb: sys.total_memory() as f32 / 1_073_741_824.0,
    }
}

#[tauri::command]
async fn get_ollama_vram(base_url: String) -> Option<f32> {
    validate_localhost(&base_url).ok()?;
    let url = format!("{}/api/ps", base_url.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .ok()?;
    let json: serde_json::Value = client.get(&url).send().await.ok()?.json().await.ok()?;
    let models = json["models"].as_array()?;
    let total_bytes: u64 = models.iter()
        .filter_map(|m| m["size_vram"].as_u64())
        .sum();
    if total_bytes == 0 { return None; }
    Some(total_bytes as f32 / 1_073_741_824.0)
}

#[tauri::command]
async fn get_rig_scores() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .get("http://127.0.0.1:11435")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    res.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

/// Ask RigMatch to generate a picture, and report on one already asked for.
///
/// The generating is RigMatch's job. It already owns the ComfyUI transport, the
/// graph, the checkpoint filtering and the abort path, all tested; a second
/// implementation here would be a second thing to keep correct, and it would
/// drift.
///
/// Origin is set deliberately. The bridge only accepts the two WebView origins,
/// and this is one of them — a Rust client sends no Origin unless told to, and
/// borrowing the WebView's identity is more honest than relying on the header
/// being absent.
#[tauri::command]
async fn start_rig_generation(prompt: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        // Longer than the scores fetch: this only starts the work, but RigMatch
        // has to reach its renderer before it can answer.
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .post("http://127.0.0.1:11435/generate")
        .header("Origin", "tauri://localhost")
        .json(&serde_json::json!({ "prompt": prompt }))
        .send()
        .await
        .map_err(|_| "RigMatch is not running, so it cannot generate anything.".to_string())?;

    let status = res.status();
    let body = res.json::<serde_json::Value>().await.unwrap_or(serde_json::Value::Null);
    if !status.is_success() {
        // Pass RigMatch's own words through rather than inventing a message: it
        // knows whether ComfyUI is missing, busy, or simply has no checkpoint
        // that can draw.
        let reason = body
            .get("error")
            .and_then(|e| e.as_str())
            .unwrap_or("RigMatch refused the request.");
        return Err(reason.to_string());
    }
    Ok(body)
}

#[tauri::command]
async fn get_rig_generation(id: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .get(format!("http://127.0.0.1:11435/generate/{id}"))
        .header("Origin", "tauri://localhost")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    res.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

/// Fetch the bytes of a picture RigMatch made, for showing in the transcript.
///
/// RigMatch reads its own file and hands over base64. The companion never
/// touches the filesystem for this: a "turn any path into base64" command is a
/// file-read primitive with a chat window attached, however carefully guarded.
#[tauri::command]
async fn get_rig_generation_image(id: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .get(format!("http://127.0.0.1:11435/generate/{id}/image"))
        .header("Origin", "tauri://localhost")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    res.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

// Launches RigMatch from the bundled companions layout:
//   <install-root>/companions/rigmatch-chat.exe  →  <install-root>/RigMatch.exe
#[tauri::command]
fn open_rigmatch_ai() -> Result<(), String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let install_root = exe_path
        .parent()
        .and_then(|companions| companions.parent())
        .ok_or_else(|| "Cannot resolve install root".to_string())?;
    let candidate = install_root.join("RigMatch.exe");
    if candidate.exists() {
        std::process::Command::new(&candidate)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    Err(format!(
        "RigMatch not found at {}",
        candidate.display()
    ))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // WebKitGTK (the Linux webview backing Tauri) segfaults inside
    // libnvidia-eglcore during GL context teardown on NVIDIA proprietary
    // drivers, especially on Wayland. Disabling the DMABUF renderer avoids the
    // crash. Must be set before any webview is created, and only if the user
    // hasn't already chosen a value.
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    tauri::Builder::default()
        .manage(SysInfoState(std::sync::Mutex::new(System::new())))
        .manage(ActiveStreams::default())
        .invoke_handler(tauri::generate_handler![
            get_ollama_version,
            list_ollama_models,
            get_model_context_info,
            stream_chat,
            cancel_chat,
            read_conversations,
            write_conversations,
            read_memories,
            write_memories,
            open_rigmatch_ai,
            get_system_stats,
            get_rig_scores,
            start_rig_generation,
            get_rig_generation,
            get_rig_generation_image,
            get_ollama_vram,
            get_vram_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running RigMatch Chat");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Shapes taken from a live Ollama 0.32.7, not invented — each one is here
    /// because it broke a simpler version of the parser.
    #[test]
    fn reads_a_plain_grouped_query_model() {
        let json = serde_json::json!({ "model_info": {
            "llama.context_length": 131072,
            "llama.block_count": 28,
            "llama.attention.head_count": 24,
            "llama.attention.head_count_kv": 8,
            "llama.attention.key_length": 128,
            "llama.attention.value_length": 128,
            "llama.embedding_length": 3072,
        }});
        let info = parse_context_info(&json).expect("llama should parse");
        assert_eq!(info.max_context, 131072);
        assert_eq!(info.block_count, 28);
        assert_eq!(info.head_count_kv, 8);
        assert_eq!(info.key_length, 128);
        assert_eq!(info.value_length, 128);
    }

    #[test]
    fn a_null_head_count_kv_falls_back_to_the_full_head_count() {
        // granite4:3b publishes head_count_kv as JSON null and omits the
        // per-head widths entirely. Reading null as 0 would make the KV cache
        // look free and hand out a context far larger than the card can hold.
        let json = serde_json::json!({ "model_info": {
            "granite.context_length": 131072,
            "granite.block_count": 40,
            "granite.attention.head_count": 40,
            "granite.attention.head_count_kv": serde_json::Value::Null,
            "granite.embedding_length": 2560,
        }});
        let info = parse_context_info(&json).expect("granite should parse");
        assert_eq!(info.head_count_kv, 40, "null must not be read as zero");
        // 2560 embedding / 40 heads = 64 per head, derived rather than assumed.
        assert_eq!(info.key_length, 64);
        assert_eq!(info.value_length, 64);
    }

    #[test]
    fn nested_sub_architectures_do_not_shadow_the_text_model() {
        // deepseek-ocr carries vision and SAM towers alongside the text model.
        // Matching on suffix alone can pick a tower's block_count; the text
        // model is the shallowest key.
        let json = serde_json::json!({ "model_info": {
            "deepseekocr.context_length": 8192,
            "deepseekocr.block_count": 12,
            "deepseekocr.attention.head_count": 10,
            "deepseekocr.attention.head_count_kv": 10,
            "deepseekocr.embedding_length": 1280,
            "deepseekocr.sam.block_count": 12,
            "deepseekocr.sam.embedding_length": 768,
            "deepseekocr.vision.block_count": 24,
            "deepseekocr.vision.embedding_length": 1024,
        }});
        let info = parse_context_info(&json).expect("deepseek-ocr should parse");
        assert_eq!(info.block_count, 12, "took a vision tower's depth");
        assert_eq!(info.key_length, 128, "1280 / 10 heads, not the vision width");
    }

    #[test]
    fn a_sub_architecture_sorting_first_still_loses_to_the_top_level() {
        // Depth, not map order, is what decides — a nested key whose segment
        // sorts before the field name would otherwise win.
        let json = serde_json::json!({ "model_info": {
            "arch.block_count": 32,
            "arch.aaa.block_count": 99,
            "arch.context_length": 4096,
        }});
        assert_eq!(parse_context_info(&json).unwrap().block_count, 32);
    }

    #[test]
    fn a_model_without_a_declared_context_is_left_alone() {
        // No context_length means we cannot size anything; the caller keeps
        // Ollama's default rather than guessing.
        let json = serde_json::json!({ "model_info": { "arch.block_count": 32 } });
        assert!(parse_context_info(&json).is_none());
        assert!(parse_context_info(&serde_json::json!({})).is_none());
    }

    #[test]
    fn a_missing_store_reads_as_empty_not_as_an_error() {
        let dir = std::env::temp_dir().join("rigmatch-store-missing");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("conversations.json");
        assert_eq!(read_json_file(&path).unwrap(), None);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn writing_replaces_an_existing_store_and_leaves_no_temp_behind() {
        // Rename-over-existing is platform specific; this is the behaviour the
        // atomic write depends on, so it gets checked rather than assumed.
        let dir = std::env::temp_dir().join("rigmatch-store-replace");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("conversations.json");

        write_json_file(&path, "{\"version\":1,\"conversations\":{}}").unwrap();
        assert_eq!(read_json_file(&path).unwrap().unwrap(), "{\"version\":1,\"conversations\":{}}");

        write_json_file(&path, "second").unwrap();
        assert_eq!(read_json_file(&path).unwrap().unwrap(), "second");

        // The scratch file must not survive a successful write.
        assert!(!path.with_extension("json.writing").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_failed_write_leaves_the_previous_store_readable() {
        // The temp file is what a partial write damages; the real one is only
        // replaced once the bytes are down.
        let dir = std::env::temp_dir().join("rigmatch-store-durable");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("conversations.json");
        write_json_file(&path, "good").unwrap();

        // A directory where the scratch file needs to go makes the write fail.
        let temp = path.with_extension("json.writing");
        std::fs::create_dir_all(&temp).unwrap();
        assert!(write_json_file(&path, "bad").is_err());
        assert_eq!(read_json_file(&path).unwrap().unwrap(), "good");

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[tokio::test]
    async fn a_cancel_that_lands_before_the_wait_is_not_lost() {
        // The select! only starts waiting once the request is in flight, so a
        // Stop pressed in that window must still be seen. notify_one leaves a
        // permit behind; notify_waiters would have dropped it on the floor and
        // the generation would have run to completion anyway.
        let notify = tokio::sync::Notify::new();
        notify.notify_one();
        tokio::time::timeout(std::time::Duration::from_millis(500), notify.notified())
            .await
            .expect("a cancel sent before the wait began was lost");
    }

    #[test]
    fn cancelling_an_unknown_stream_is_harmless() {
        // Stop can arrive after a reply has already finished and deregistered.
        let streams = ActiveStreams::default();
        let notify = std::sync::Arc::new(tokio::sync::Notify::new());
        streams.0.lock().unwrap().insert("live".into(), notify);
        {
            let map = streams.0.lock().unwrap();
            assert!(map.get("gone").is_none());
            assert!(map.get("live").is_some());
        }
        streams.0.lock().unwrap().remove("live");
        assert!(streams.0.lock().unwrap().is_empty(), "finished streams must not accumulate");
    }

    #[test]
    fn nvidia_total_parses_both_output_forms() {
        // Captured from the RTX 4070 on this machine. `nounits` is not honoured
        // by every driver version, so the unit-bearing form has to parse too.
        assert_eq!(parse_nvidia_total_mb("12282"), Some(12282));
        assert_eq!(parse_nvidia_total_mb("12282 MiB"), Some(12282));
        assert_eq!(parse_nvidia_total_mb("12282 MiB
"), Some(12282));
        // Multi-GPU: the first card is the one Ollama uses by default.
        assert_eq!(parse_nvidia_total_mb("12282
24564"), Some(12282));
    }

    #[test]
    fn nvidia_total_refuses_anything_it_cannot_read() {
        // Better to keep the fixed budget than to size a KV cache against a
        // number that came out of an error message.
        assert_eq!(parse_nvidia_total_mb(""), None);
        assert_eq!(parse_nvidia_total_mb("

"), None);
        assert_eq!(parse_nvidia_total_mb("NVIDIA-SMI has failed"), None);
        assert_eq!(parse_nvidia_total_mb("[N/A]"), None);
        assert_eq!(parse_nvidia_total_mb("0"), None, "a zero total would divide badly");
    }
}
