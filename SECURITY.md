# Security Policy

## Supported Versions

Only the latest release of RigMatch receives security fixes.

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |
| Older   | No        |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub Issues.**

Email security reports to: **daveeuson@gmail.com**

Include in your report:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (optional)

You can expect an acknowledgement within 48 hours. If confirmed, a fix will be released as soon as practical and you will be credited (unless you prefer to remain anonymous).

## Scope

RigMatch is a local-only desktop application. It:
- Sends no telemetry, analytics, or usage data anywhere, ever. Nothing about what you test, score, or run leaves the machine.
- Makes outbound connections only to these hosts, and only for the stated purpose:
  - `ollama.com` — the model catalog, and the Ollama installer if you choose to download it
  - `github.com` / `api.github.com` — update checks
  - `developer.nvidia.com` — the newest CUDA toolkit version, **only when you press a "check my computer" control**. Automatic refreshes (launch, and the background poll that waits for Ollama to appear) never contact it.
  - `openrouter.ai` — only if you opt in to cloud-model judging and supply your own key
  - `huggingface.co`, and the Hugging Face download servers under `hf.co` that it redirects to — image and video model files, **only when you press Download and agree to the model's terms**. A download must start at `huggingface.co`, and every redirect it follows must stay on those two domains or it is refused. Each file is checked against its published size and, where Hugging Face publishes one, its SHA-256 before ComfyUI can see it; a file that fails the check twice is deleted rather than kept. Opening a model's licence from the download dialog also goes to `huggingface.co`.
  - the local Ollama instance at `127.0.0.1:11434`, and the ComfyUI instance you point RigMatch at, which must be a local address (`127.0.0.1:8188` by default)
- Stores no user accounts or passwords. If you opt in to cloud judging, your OpenRouter API key is stored locally in the app's own storage — it is never transmitted anywhere except to OpenRouter itself.
- If you add a Hugging Face access token — needed only for gated models, whose publisher asks you to accept terms first — it is stored locally in the app's own storage, unencrypted, like the OpenRouter key. It is sent only to `huggingface.co` and only for a gated file, and never to the download server Hugging Face redirects to. A read-only token is all RigMatch needs. Clear Data removes it.
- Logs system metadata (CPU, GPU, RAM, hostname) to a local file only — this data is never automatically transmitted

Out of scope: vulnerabilities requiring physical access to the machine, issues in Ollama itself, or theoretical attacks that require the attacker to already control the local machine.

## Privacy

The bug report button opens a GitHub Issues form. No data is automatically transmitted. Any diagnostics you include in a bug report are voluntary.
