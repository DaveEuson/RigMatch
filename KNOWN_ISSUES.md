# Known Issues — RigMatch.AI v0.1 Beta

This is a candid list of issues we know about going into the beta. If you hit something not listed here, that's a genuine bug report — please share it.

---

## Data & Scoring

**Legacy scorecards need a fresh retest**
Scorecards saved before the current scoring schema are now labeled **Retest recommended** and are excluded from category picks so old speed calibration does not crown misleading winners. Re-running a test updates that model to the current scoring schema.

**Close matches now use decimal/tiebreak sorting in Scorecards**
Scorecards still show familiar grades, but rankings now use a one-decimal internal Match value plus the same answer-quality, finish-rate, fit, speed, and alphabetical tiebreakers. This reduces the old "five models at 89·A" pileup.

**Speed Dating profile refresh**
Speed Dating now saves each result under the exact model name selected in the lineup, so the contestant card and individual profile panel should update immediately after a run.

---

## Chat Companion (RigMatch Chat)

No known chat-companion blockers at this time. The Visible Models control can now restore hidden buddies without clearing chat data.

---

## Linux / Jetson

**Linux ARM64 / Jetson support is experimental**
RigMatch now builds separate Linux x64 and Linux ARM64 artifacts. NVIDIA Jetson users should install the ARM64/aarch64 package only; installing the x64 package can show confusing "dependencies are not installable" errors. Jetson testing should be treated as beta-within-beta until we have more hardware coverage.

---

## What's Working Well

- Model counts are consistent across all panels
- Cloud models (tagged ☁) are excluded from rankings and Top Pick
- Speed Dating side-by-side comparison is fully functional
- Score weights (34/32/18/16) are shown on the methodology page
- Real tok/s is measured live and displayed per-question
- Run logs with path + copy are available for bug reports
- All local model inference runs entirely on your machine — no prompts leave your computer
- Chat companion renders markdown formatting (bold, bullets, code blocks)
- Chat header shows CPU, RAM, and live VRAM used by loaded models

---

## Reporting Bugs

If you find something not on this list, please open an issue or drop it in the beta feedback channel. Screenshots and your hardware spec (VRAM, OS) help narrow things down fast.

*Last updated: v0.1 beta — June 2026*

## Upcoming Features

### Optional Advanced Capability Tests

RigMatch should grow beyond the core quick-question benchmark with optional lab-style tests that produce separate grades instead of changing the main Match score.

Planned test ideas:

- **App Builder**: ask a model to create a complete single-file app or game, such as a Tetris-style HTML game, then grade structure, controls, scoring, game loop, collision logic, line clearing, restart/game-over handling, and truncation risk.
- **Image Generation**: extra-beta Ollama Image Lab is available with explicit platform/model-size warnings, opt-in pulls, and separate image grades. Future hardening should add better image-model discovery, richer quality checks, and optional ComfyUI/Stable Diffusion backend support.
- **Video Generation**: keep as a later research item. It needs stronger hardware checks, backend selection, longer runtimes, and much larger storage/VRAM safeguards.

Safeguards required before expanding these tests:

- Do not auto-download huge models for advanced tests.
- Show estimated model size, disk impact, RAM/VRAM risk, and backend requirements before any pull.
- Keep advanced grades separate from the core RigMatch 0-100 score.
- Use installed models only unless the user explicitly opts into a download.
- Add timeouts and clear failure states for slow or unsupported models.
- Do not execute generated code automatically inside RigMatch; show/copy the output first.
