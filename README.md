# RigMatch.AI

AI model matchmaking for your computer. RigMatch.AI benchmarks your local Ollama models, scores them for speed, answer quality, and hardware fit, and finds the best one for your specific rig — wrapped in a dating game show theme to make testing less boring.

<p align="center">
  <img src="src/assets/robot-scorecard-ceremony.png" alt="RigMatch.AI scorecard ceremony" width="100%">
</p>

## Download

> **Beta v0.1.0** — Windows, macOS, and Linux builds are available on the [Releases](../../releases) page.

| Platform | Installer |
|---|---|
| Windows | `.exe` (NSIS installer) |
| macOS | `.dmg` — unsigned beta, see [macOS note](#platform-notes) |
| Linux | `.AppImage` / `.deb` |

## What It Does

- Scans your machine (CPU, RAM, VRAM) and detects installed Ollama models
- Downloads models directly from the Ollama library
- Runs a Speed Dating benchmark — up to five models, same questions, timed and scored on your hardware
- Scores each model on **answer quality**, **speed**, and **hardware fit**
- Picks a **Top Match** for your specific rig
- Opens **RigMatch Chat** so you can talk to your top model right away

Everything runs locally. No cloud, no account, no subscription.

## Screenshots

<p align="center">
  <img src="Screenshots/0.1/Screenshot_33.jpg" alt="Models hub — browse, test, and compare AI models" width="49%">
  <img src="Screenshots/0.1/Screenshot_1.jpg" alt="RigMatch Chat — talk to your top-ranked model" width="49%">
</p>

## Apps

This repo contains two apps that ship together:

| App | Tech | Purpose |
|---|---|---|
| **RigMatch.AI** | Electron + React + TypeScript | Main matchmaking UI |
| **RigMatch Chat** | Tauri + React + TypeScript + Rust | Chat with your top model |

RigMatch Chat ships as a companion binary inside `companions/` and is launched from the match screen.

## Requirements

- [Ollama](https://ollama.com) installed and running locally
- Node.js 20+
- Rust + Cargo (to build RigMatch Chat from source)

## Run Locally

```bash
npm install
npm run dev
```

## Build

Builds are handled automatically by GitHub Actions on every tagged release. To build manually:

```bash
# Windows installer (run on Windows)
npm run dist:win

# macOS disk image (run on macOS)
npm run dist:mac

# Linux AppImage + deb (run on Linux)
npm run dist:linux

# Unpacked directory — faster, no installer
npm run pack:win
```

### Building RigMatch Chat (companion)

```bash
cd rigmatch-chat
npx tauri build
# Copy output to companions/
cp src-tauri/target/release/rigmatch-chat ../companions/
```

## Platform Notes

- **Windows**: Full NSIS installer with optional component selection (RigMatch.AI and/or RigMatch Chat)
- **macOS**: Unsigned beta builds — right-click → Open on first launch, or run `xattr -cr /Applications/RigMatch.AI.app` in Terminal
- **Linux**: AppImage (run anywhere) and .deb (Debian/Ubuntu)

## Donationware

Free to use during beta. If it saves you time or helps you find a better model:

[buymeacoffee.com/daveeuson](https://buymeacoffee.com/daveeuson)

## Contributing

Issues and PRs welcome. The codebase is Electron + React + TypeScript (main app) and Tauri + Rust (companion chat).

### Call for Artists

RigMatch.AI needs illustrated avatar portraits for each Ollama model family. Currently the app ships with placeholder avatars — we want real character portraits that fit the dating-show aesthetic.

**Seven families needed:**

| Family | Models |
|---|---|
| `llama` | Meta's Llama family |
| `gemma` | Google's Gemma family |
| `mistral` | Mistral AI family |
| `phi` | Microsoft's Phi family |
| `qwen` | Alibaba's Qwen family |
| `deepseek` | DeepSeek family |
| `generic` | Fallback for unrecognised models |

**Style brief:** Square portrait, ~512×512px or larger, PNG or SVG, transparent or dark background. Tone: playful and character-driven — think dating show contestant portraits, not corporate AI mascots. They appear in buddy lists, profile modals, and chat headers at 40–80px, so they need to read as distinct personalities at small sizes.

**The deal:** This is a donationware project — no budget right now. Contributors get full credit in the app's About page (name + link of your choice). If you only want to tackle one family rather than all seven, that works too.

Open an issue or email [daveeuson@gmail.com](mailto:daveeuson@gmail.com) if you're interested.
