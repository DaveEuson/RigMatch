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

#[tauri::command]
async fn stream_chat(
    base_url: String,
    model: String,
    messages: Vec<ChatMessage>,
    on_token: Channel<String>,
) -> Result<(), String> {
    validate_localhost(&base_url)?;
    validate_model_name(&model)?;
    let url = format!("{}/api/chat", base_url.trim_end_matches('/'));
    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": true,
    });
    let client = reqwest::Client::new();
    let mut res = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Ollama chat returned {}", res.status()));
    }
    let mut buffer = String::new();
    while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
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
                        on_token.send(content.to_string()).map_err(|e| e.to_string())?;
                    }
                }
                if parsed["done"].as_bool().unwrap_or(false) {
                    return Ok(());
                }
            }
        }
        buffer = remainder;
    }
    Ok(())
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

// Launches RigMatch.AI from the bundled companions layout:
//   <install-root>/companions/rigmatch-chat.exe  →  <install-root>/RigMatch.AI.exe
#[tauri::command]
fn open_rigmatch_ai() -> Result<(), String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let install_root = exe_path
        .parent()
        .and_then(|companions| companions.parent())
        .ok_or_else(|| "Cannot resolve install root".to_string())?;
    let candidate = install_root.join("RigMatch.AI.exe");
    if candidate.exists() {
        std::process::Command::new(&candidate)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    Err(format!(
        "RigMatch.AI not found at {}",
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
        .invoke_handler(tauri::generate_handler![
            get_ollama_version,
            list_ollama_models,
            stream_chat,
            open_rigmatch_ai,
            get_system_stats,
            get_rig_scores,
            get_ollama_vram,
        ])
        .run(tauri::generate_context!())
        .expect("error while running RigMatch Chat");
}
