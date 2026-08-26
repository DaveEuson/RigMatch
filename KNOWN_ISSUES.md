# Known Issues — RigMatch v0.7 Beta

This is a candid list of issues we know about going into the beta. If you hit something not listed here, that's a genuine bug report — please share it.

---

## 0.2.5 Release Readiness

0.2.5 focuses on more trustworthy scoring and clearer progress. Speed is now the median of three timed runs per question, and the answer-quality heuristics are more robust. Benchmarks show live per-run progress, and a running benchmark stays visible across the app even after a window reload.

**Two things returning users will notice:** because scoring changed, saved scorecards are flagged **Retest recommended** (re-running updates them), and **benchmarks take roughly 3× longer** now since each question runs three times for a steadier speed score.

---

## Data & Scoring

**A model tested on another computer is no longer credited to this one**
Fixed in 0.7. If you point RigMatch at an Ollama running on a second machine and
benchmark a model there, the score now records that machine's name and no
hardware at all — RigMatch cannot ask a remote computer what card it has, and
naming this one was a falsehood produced by the very mechanism meant to stop
scores being attributed to hardware that did not earn them. Such a score is
marked **Measured on another computer — retest here**, and does not crown a
winner, for the same reason a score from a swapped graphics card does not.

**Image scores from before 0.7 used the wrong sampler settings**
Every image checkpoint was asked for 20 steps with guidance at 7 — correct for
ordinary Stable Diffusion, and wrong for a distilled model like SDXL-Turbo,
which is built to finish in a handful of steps with guidance off. Those runs
produced oversaturated, posterised pictures, and the adherence judge then marked
the model down for a request RigMatch had made badly. 0.7 asks each checkpoint
for what it was built for. Image scores saved before this are not comparable
with ones taken after it; re-run them.

**Legacy scorecards need a fresh retest**
Scorecards saved before the current scoring schema are now labeled **Retest recommended** and are excluded from category picks so old speed calibration does not crown misleading winners. Re-running a test updates that model to the current scoring schema.

**Close matches now use decimal/tiebreak sorting in Scorecards**
Scorecards still show familiar grades, but rankings now use a one-decimal internal Match value plus the same answer-quality, finish-rate, fit, speed, and alphabetical tiebreakers. This reduces the old "five models at 89·A" pileup.

**Speed Dating profile refresh**
Speed Dating now saves each result under the exact model name selected in the lineup, so the contestant card and individual profile panel should update immediately after a run.

**Popularity (pull counts) no longer available — upstream removal**
ollama.com removed public pull counts from its model library pages in mid-2026, so RigMatch's live catalog sync can no longer read them; there is no API or page that still exposes the numbers. The Models table now shows a measured **Speed** column (tok/s from your own tests) in that slot instead of an empty Popularity column. The popularity scraper is still in place — if Ollama restores the stats, the column switches back automatically.

---

## Chat Companion (RigMatch Chat)

No known chat-companion blockers at this time. The Visible Models control can now restore hidden buddies without clearing chat data.

---

## Linux / Jetson

**Linux ARM64 / Jetson — now tested on real hardware**
RigMatch builds separate Linux x64 and Linux ARM64 artifacts. Jetson users should install the ARM64/aarch64 package only; installing the x64 package can show confusing "dependencies are not installable" errors.

As of 0.7.1 this is no longer untested: a Jetson Orin Nano running JetPack R39 launches RigMatch, reads the board, scores models and runs the companion. One machine is not broad coverage, and other Jetson generations remain unverified, but it is no longer a build nobody has started.

**RigMatch Chat could crash on launch with NVIDIA graphics (fixed in 0.3.3)**
On Linux with the NVIDIA proprietary driver — most often on Wayland — the RigMatch Chat companion could segfault immediately on launch. The crash was inside WebKitGTK's GL context handling (`libnvidia-eglcore`), an upstream WebKitGTK/NVIDIA interaction, not a bug in RigMatch itself. As of 0.3.3, RigMatch Chat disables WebKitGTK's DMABUF renderer at startup, which avoids the crash. If you still hit it on an older build or an unusual driver combination, launch with the environment variable `WEBKIT_DISABLE_DMABUF_RENDERER=1` set.

**VRAM could read as 0 on some Linux/NVIDIA systems (fixed in 0.3.3, extended in 0.7.1)**
The hardware scan sometimes couldn't read NVIDIA graphics memory on Linux, reporting 0 VRAM. That made RigMatch recommend only the smallest models (e.g. phi3:mini even on a 4090). As of 0.3.3, RigMatch falls back to `nvidia-smi` to read total VRAM when the normal scan comes back empty.

That fallback was not enough on a Jetson, where the GPU is not a PCI device at all: the usual scan returns no graphics card whatsoever, and `nvidia-smi` answers `[N/A]` to every memory question. RigMatch 0.7.1 reads the board's own name from the device tree, recognises it as unified memory, and reports the shared pool — 7.4 GB on an Orin Nano, where 0.7.0 reported 0 GB and offered only the smallest models.

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

*Last updated: v0.3.3 beta — July 2026*

## Upcoming Features

### Optional Advanced Capability Tests

RigMatch should grow beyond the core quick-question benchmark with optional lab-style tests that produce separate grades instead of changing the main Match score.

Status as of 0.2.6:

- **App Builder** (shipped): asks a model to create a complete single-file Tetris-style HTML game and grades structure, controls, scoring, game loop, collision logic, line clearing, restart/game-over handling, and truncation risk. As of 0.2.6 the output is also playable through an explicit **Play It** sandboxed preview (isolated iframe, network/storage/file access blocked); RigMatch never runs generated code automatically.
- **Image Generation** (shipped, extra-beta): Ollama Image Lab with explicit platform/model-size warnings, opt-in pulls, and separate image grades. As of 0.2.6 it also detects image-generation models already installed in the local Ollama library. Future hardening should add richer quality checks and optional ComfyUI/Stable Diffusion backend support.
- **Video Generation** (still a later research item): no local backend RigMatch supports can generate video yet, so 0.2.6 shows an honest locked research card with the unlock requirements. It needs a real backend, stronger hardware checks, longer runtimes, and much larger storage/VRAM safeguards before it can be a test.

Safeguards required before expanding these tests:

- Do not auto-download huge models for advanced tests.
- Show estimated model size, disk impact, RAM/VRAM risk, and backend requirements before any pull.
- Keep advanced grades separate from the core RigMatch 0-100 score.
- Use installed models only unless the user explicitly opts into a download.
- Add timeouts and clear failure states for slow or unsupported models.
- Do not execute generated code automatically inside RigMatch; show/copy the output first.
