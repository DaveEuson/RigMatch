# RigMatch Chat

AIM-style chat companion for your top-ranked local AI model. Launched from RigMatch.AI's match screen, or run standalone.

## What It Does

- Lists your installed Ollama models as "buddies" with avatars and rankings from RigMatch.AI
- Streams chat responses token-by-token
- Shows CPU/RAM usage live
- Remembers conversation history per model
- Ships as a companion binary inside `companions/` alongside RigMatch.AI

## Tech

Tauri v2 + React + TypeScript (frontend) · Rust (backend IPC, system stats, Ollama streaming)

## Requirements

- [Ollama](https://ollama.com) running locally (default: `http://127.0.0.1:11434`)
- Rust + Cargo for building from source

## Run / Build

```bash
# Dev mode
npx tauri dev

# Production build
npx tauri build
```

Output: `src-tauri/target/release/rigmatch-chat.exe` (Windows) or `rigmatch-chat` (Mac/Linux)

## Standalone Use

RigMatch Chat works without RigMatch.AI. It reads any Ollama instance on localhost and lets you chat with any installed model directly.
