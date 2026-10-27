# RigMatch Chat

AIM-style chat companion for your top-ranked local AI model. Launched from RigMatch's match screen, or run standalone.

## What It Does

- Lists your installed Ollama models as "buddies" with avatars and rankings from RigMatch
- Streams chat responses token-by-token
- Shows CPU/RAM usage live
- Remembers conversation history per model
- Ships as a companion binary inside `companions/` alongside RigMatch

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

## Running it for a test

Chat saves your conversations, memories and settings in your user profile, so a test that launches it writes into your real history. Set `RIGMATCH_CHAT_DATA_DIR` to the full path of a throwaway folder first and Chat keeps everything there instead, creating the folder if it is missing; a RigMatch started with it set passes it on to the Chat it opens. A value Chat cannot use (empty, a relative path, a path containing `..`, or a folder that cannot be made) stops it with exit code 2 and a message on stderr, never a fall back to your real folder. On a Mac the page's own settings are not kept at all in such a run, because WebKit has no folder to point at.

## Standalone Use

RigMatch Chat works without RigMatch. It reads any Ollama instance on localhost and lets you chat with any installed model directly.
