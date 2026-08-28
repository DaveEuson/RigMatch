# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two primary audiences, confirmed as **equally first-class** — neither mode may be degraded to serve the other.

**The beginner (Simple Mode).** Someone who has heard that "local AI" is possible and wants it, but has never encountered VRAM, quantization, or parameter counts. They are at their own desk, on their own PC, with no one to ask. Their job: end up with one good AI model running locally, without having to learn how to choose it. They arrive not knowing whether their computer is even capable, and the first thing they need is reassurance, not options.

**The enthusiast (Advanced Mode).** Someone already running Ollama who has models installed and opinions about them, but no trustworthy way to compare them on their own hardware. Their job: get a defensible answer to "which of these is actually best on my rig," with the measurements exposed so they can check the work. They will not accept a number they cannot interrogate.

Both share one situation that defines the product: the answer is different on every machine, so no article, leaderboard, or friend's recommendation can supply it.

## Product Purpose

RigMatch benchmarks local LLMs on the user's actual hardware through Ollama and crowns a **Top Match**: one model, with a 0–100 Match Score. It exists because choosing a local model is a research project disguised as a download, and the correct answer depends on hardware the user cannot easily read or reason about.

Success, as confirmed by the owner, pulls in three directions at once:

1. **Reach** — a niche desktop utility lives or dies on discovery. Downloads and shareable results matter.
2. **Activation** — a non-technical person actually ending up with a local model they use, not just an installer they ran.
3. **Depth** — being the most capable local benchmarking tool that exists, for the people who want that.

## Positioning

RigMatch measures on *your* machine. Every published benchmark, leaderboard, and model card reports performance on hardware that is not yours, which makes them approximately useless for the decision the user is actually making. RigMatch runs the same questions against every contestant on the machine the model will live on, and folds hardware fit into the score itself.

The second differentiator is framing: RigMatch is a **dating game show**. Models are contestants, benchmarks are speed dates, the winner is a Top Match. This turns an intimidating technical comparison into something a beginner can sit through and enjoy, and it is the reason the app can serve someone who does not know what a parameter is.

## Operating Context

- **Desktop app, local runtime.** RigMatch is an Electron desktop application (Windows, macOS Intel/Apple Silicon, Linux x64/ARM64). It requires [Ollama](https://ollama.com) installed and running locally; Ollama is the engine that actually executes models.
- **The Simple Mode wizard** is five steps: Setup (detect Ollama + read hardware) → Pick (choose up to five contestants) → Download (install the lineup, cancellable, resumable) → Compare (Speed Dating on the game-show stage) → Winner (Top Match reveal). A game-show host character narrates throughout.
- **Advanced Mode** is the control room: a dense sortable models table, custom test suites, skill labs, diagnostics, run logs, and per-run history. The Top Match carries over between modes; switching modes preserves the user's place.
- **RigMatch Chat** is a separate Tauri companion app (AIM-style buddy-list chat with installed models), shipped inside `companions/` and launched from the match screen or run standalone.
- **The marketing site** (`site/index.html`) is served from GitHub Pages, with the browser preview mode of the app one click away at `/app/` as an interactive demo. The scorecard → landing → demo/download funnel is the distribution path.
- **Hardware reading** — GPU, VRAM, RAM, and disk — decides which models even qualify as contestants, and RigMatch checks whether something else is already using the GPU before a run, because a busy machine makes every score come out low.

## Capabilities and Constraints

**Scoring.** The Match Score is a weighted 0–100 composite defined in `src/lib/scoring.ts`: answer quality 0.34, speed 0.32, stability 0.18, hardware fit 0.16. Speed is the median of three timed runs per question. Scores carry a schema version; scorecards saved under an older schema are flagged **Retest recommended** rather than silently compared against current ones.

**Fairness rules that are load-bearing.** Each model is unloaded before the next one runs, so no contestant shares the GPU with a predecessor. Every contestant answers the same questions. These are the reason the score means anything, and they cost real time to honour.

**Skill labs.** Beyond the core benchmark: App Builder (models write a runnable single-file web app, judged and previewed), vision tests, image generation, and a parked Code Challenge concept. An LLM judge grades what heuristics cannot.

**Themes.** Five retro studio color themes: Stage Plum (the default), Avocado Green, Mustard Yellow, Retro Teal, Velvet Chocolate. All are warm, 70s-game-show palettes built from a shared set of hues.

**Stack.** Electron + React 19 + TypeScript + Vite for the main app; Tauri v2 + React + Rust for the chat companion; `systeminformation` for hardware reads; electron-builder for distribution; electron-updater for in-app updates.

**Known limits.** Browser preview mode cannot read VRAM/GPU accurately, so the Fit pillar degrades to an estimate there — it is a demo, not a functional substitute. Ollama pull counts (popularity) are still published, but the scrape that reads them broke when ollama.com changed its markup, and the Popularity column silently relabels itself Speed whenever no model carries a count. That was read as the counts being withdrawn upstream; they were not. Fixed on the 0.8 branch, with a networked check so the next markup change fails loudly.

**Undecided.** Whether cloud models (via OpenRouter) get a separate "Cloud Reference" track is parked, not settled — the roadmap is explicit that they must never join the local Match Score board, since a datacenter 70B would crown itself Top Match and invalidate the premise.

## Brand Commitments

The owner's position on all of the following: these are **strong core concepts, not immovable constraints**. Treat them as the product's current identity, which future work should have a real reason to depart from — not as rules that forbid departure.

- **The game-show world.** Contestants, speed dating, the host, the Top Match reveal, the heart-marquee motif.
- **Contestant avatars.** A documented house style (`docs/avatar-art-direction.md`): 512×512 webp, rounded-square metallic bezel, magenta velvet curtains, glowing heart marquee behind the head, dot-matrix smile. The rule that makes the set feel designed: *every robot literally embodies its model's name, logo, or etymology* — Ollama is a llama, DeepSeek is a whale, Mistral is a wind, Phi is the letter Φ.
- **Plain-language honesty.** The changelog voice: explain what broke in words a beginner understands, name the flaw, never dress it up. See `CHANGELOG.md` — this is a written, consistent voice, not an accident.
- **The name is RigMatch**, everywhere the user can see it: installer, filenames, Start Menu, applications list.

**One commitment is firmer than the rest — the data promise.** No silent data collection, ever: no account, no telemetry, nothing leaving the machine without the user knowing. Optional cloud *features* (an opt-in OpenRouter reference track, for example) are fair game; silent data flow is not. The "100% local" badge on the site and README is a promise about data, and it holds.

## Evidence on Hand

- **Real screenshots** of all five Simple Mode steps in `docs/images/` (`01-setup` … `05-winner`), plus a hero banner.
- **A real outside review.** Version 0.4.1 ("The Reviewer's Cut") shipped every fix from RigMatch's first external review, credited by name in the changelog. That review — and the fixes — are documented evidence of responsiveness, not a testimonial.
- **A detailed public changelog** back through 0.2.x, written in plain language, that doubles as the release notes shown in the app's Update Center. Single source: `src/data/releaseNotes.ts`.
- **A candid known-issues document** (`KNOWN_ISSUES.md`) that names unresolved problems rather than hiding them.
- **Avatar art** in `src/assets/model-avatar-*.webp`, with an art-direction doc for extending the set.
- **Current version:** 0.7.1, distributed as beta builds.

**Absences future work must not fabricate:** there are no testimonials, no named customers, no user counts, no download numbers, no press coverage, and no benchmark comparisons against competing tools. macOS builds are unsigned. Nothing may claim otherwise.

## Product Principles

1. **The answer is local or it is worthless.** Every measurement must come from this machine. A number borrowed from someone else's hardware is not an answer to the question RigMatch asks.
2. **A fair fight, or no fight.** Same questions, same machine state, same conditions for every contestant. When fairness and convenience conflict, fairness wins — even when it makes runs three times longer.
3. **Two doors, one product.** The beginner never has to see the control room, and the enthusiast never has to sit through the wizard. Neither path is a degraded version of the other.
4. **Say the true thing plainly.** When something is estimated, broken, or uncertain, the interface says so in words a beginner understands. Honesty is the feature that makes the score worth trusting.
5. **The show is how the medicine goes down.** The game-show framing is the mechanism by which a benchmarking tool becomes usable by someone who would otherwise never run one. Take it out and a beginner has no reason to sit through five steps.
