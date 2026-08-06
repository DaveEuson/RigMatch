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
  - the local Ollama instance at `127.0.0.1:11434`
- Stores no user accounts or passwords. If you opt in to cloud judging, your OpenRouter API key is stored locally in the app's own storage — it is never transmitted anywhere except to OpenRouter itself.
- Logs system metadata (CPU, GPU, RAM, hostname) to a local file only — this data is never automatically transmitted

Out of scope: vulnerabilities requiring physical access to the machine, issues in Ollama itself, or theoretical attacks that require the attacker to already control the local machine.

## Privacy

The bug report button opens a GitHub Issues form. No data is automatically transmitted. Any diagnostics you include in a bug report are voluntary.
