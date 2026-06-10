# RigMatch.AI

Find the best local AI model for your computer. RigMatch benchmarks your installed Ollama models on your actual hardware — scored for speed, answer quality, and hardware fit — wrapped in a dating game show theme to make testing less boring.

<p align="center">
  <img src="Screenshots/0.1/Rigmatch1.gif" alt="RigMatch.AI demo" width="100%">
</p>

## Download

**Beta v0.1.1** — [All platforms →](../../releases/latest)

| Platform | Installer |
|---|---|
| Windows | `.exe` installer or `.zip` portable — [Releases page](../../releases/latest) |
| macOS | `.dmg` — unsigned beta, right-click → Open on first launch — [Releases page](../../releases/latest) |
| Linux | `.AppImage` (run anywhere) or `.deb` (Debian/Ubuntu) — [Releases page](../../releases/latest) |

## Quick Start

1. Install and start [Ollama](https://ollama.com).
2. Download RigMatch.AI from the [Releases](../../releases) page and install it.
3. Open RigMatch and click **Check Local** — it will detect your Ollama setup.
4. Pick up to five models from the Models hub.
5. Click **Start Speed Dating** to run the benchmark.
6. Review the Scorecards and lock in your **Top Match**.
7. Open **RigMatch Chat** to talk to your winner.

## What It Does

- Scans your machine (CPU, RAM, VRAM) and detects installed Ollama models
- Downloads models directly from the Ollama library
- Runs the same benchmark questions across every selected model, timed on your hardware
- Scores each model on answer quality, speed, and hardware fit
- Picks a **Top Match** for your specific rig
- Opens **RigMatch Chat** so you can talk to your top model right away

## How Scoring Works

RigMatch runs each selected model through the same local test suite on your actual hardware. Nothing is sent to a server.

The **Match Score** combines three signals:

- **Answer quality** — did the model follow the prompt and complete the task?
- **Speed** — how quickly it generated tokens on this machine
- **Hardware fit** — whether it runs comfortably within your RAM and VRAM

Scores are meant to compare models on *your* computer, not to claim a universal benchmark ranking. A model that scores 91 here might score differently on different hardware.

## Privacy

Everything runs locally. No cloud, no account, no subscription. Your prompts and results never leave your machine.

## Screenshots

<p align="center">
  <img src="Screenshots/0.1/Screenshot_33.jpg" alt="Models hub — browse, test, and compare AI models" width="49%">
  <img src="Screenshots/0.1/Screenshot_1.jpg" alt="RigMatch Chat — talk to your top-ranked model" width="49%">
</p>

## Requirements

### To use RigMatch

- [Ollama](https://ollama.com) installed and running locally
- At least one Ollama model installed — or use RigMatch to download one
- Windows, macOS, or Linux

### To build from source

- Node.js 20+
- Rust + Cargo (for RigMatch Chat)

## Platform Notes

- **Windows**: Full NSIS installer with optional component selection (RigMatch.AI and/or RigMatch Chat)
- **macOS**: Unsigned beta builds — right-click → Open on first launch, or run `xattr -cr /Applications/RigMatch.AI.app` in Terminal
- **Linux**: AppImage (run anywhere) and .deb (Debian/Ubuntu)

## Build from Source

```bash
npm install
npm run dev
```

To build installers (must run on the matching OS):

```bash
npm run dist:win    # Windows
npm run dist:mac    # macOS
npm run dist:linux  # Linux
```

Builds are also produced automatically by GitHub Actions on every tagged release.

### Building RigMatch Chat

```bash
cd rigmatch-chat
npx tauri build
cp src-tauri/target/release/rigmatch-chat ../companions/
```

## Project Structure

Two apps ship together:

| App | Tech | Purpose |
|---|---|---|
| **RigMatch.AI** | Electron + React + TypeScript | Main matchmaking UI |
| **RigMatch Chat** | Tauri + React + TypeScript + Rust | Chat with your top model |

RigMatch Chat ships as a companion binary inside `companions/` and is launched from the match screen. It also runs standalone.

## Donationware

RigMatch.AI is free to use during beta.

If it helps you find a better local model, saves you time, or makes local AI less confusing — donations help cover code signing, testing hardware, builds, and artwork.

[buymeacoffee.com/daveeuson](https://buymeacoffee.com/daveeuson)

## Contributing

Issues and PRs welcome.

## Call for Artists

RigMatch uses illustrated contestant portraits for each AI model family (llama, gemma, mistral, phi, qwen, deepseek, and a generic fallback). The app has a dating-show aesthetic — portraits appear in the buddy list, profile modals, and chat header.

If you want to contribute avatar art, open an issue or email [daveeuson@gmail.com](mailto:daveeuson@gmail.com). Full style brief and family list available on request. Credit appears in the app's About page.
