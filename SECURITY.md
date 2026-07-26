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
- Makes no outbound connections except to `ollama.com` (model catalog), `github.com` (update checks), and the local Ollama instance at `127.0.0.1:11434`
- Stores no user accounts, passwords, or cloud credentials
- Logs system metadata (CPU, GPU, RAM, hostname) to a local file only — this data is never automatically transmitted

Out of scope: vulnerabilities requiring physical access to the machine, issues in Ollama itself, or theoretical attacks that require the attacker to already control the local machine.

## Privacy

The bug report button opens a GitHub Issues form. No data is automatically transmitted. Any diagnostics you include in a bug report are voluntary.
