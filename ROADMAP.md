# RigMatch — Roadmap

Ideas parked for later. Nothing here is committed; it's a candid backlog of directions worth exploring.

---

## Backburner

### A community score database — the one thing competitors have that we cannot fake

Every other tool splits into "speed, measured on your machine" (LocalScore,
llama-bench) or "quality, measured somewhere else" (whichllm, localmodel.run).
RigMatch is alone in measuring quality *here*. What it cannot do is answer "is
my 4070 normal?", which LocalScore answers from thousands of submissions.

The tension is the whole design problem: the app's headline promise is that
nothing leaves this computer. A careless version of this costs the thing that
makes RigMatch distinctive.

A version that strengthens it instead:

- **Opt-in per upload, never a default.** A "share this result" button on one
  scorecard, the way sharing a match card already works — not a setting flipped
  once and forgotten.
- **Send the rig stamp, not the machine.** ScoreRigStamp already holds exactly
  the right row: card, VRAM, driver, app version, model digest, quantisation,
  and the scores. No hostname, no prompts, no transcripts. The payload was built
  for this without meaning to be.
- **The drift machinery is the moat.** We can refuse to aggregate scores
  measured on stale weights or mismatched hardware, because we already refuse to
  crown them. A quality database where every row knows what it was measured on
  is something none of the speed leaderboards can assemble.

Costs: a server, moderation of junk submissions, and a privacy policy worth
standing behind. 1.0+, and deserves its own design pass rather than being
bolted onto a release.

### Provider parity, then a third provider

`LocalModelProvider` is already `'ollama' | 'lm-studio'`, `getModelRuntime`
resolves a per-row baseUrl and provider, and sendChat has an OpenAI-compatible
branch. The abstraction exists; LM Studio is simply second-class — `canDownload`
is false for it, benchmark routing favours Ollama, and there is no setup path.

Make LM Studio genuinely equal first, since it is the one users actually have.
A third — llama.cpp's server — then costs mostly catalogue and detection work,
because it speaks the same OpenAI-compatible API. Doing them in the other order
means building the abstraction twice.

### Code signing

Unsigned Windows builds mean SmartScreen interrupts every download, and the
likeliest real-world harm to users is not a competitor forking the repo but
somebody re-uploading the .exe with adware under our name. A certificate fixes
both. A few hundred a year, and the right time is when there are users to
protect — before the demo video brings them.

### Discoverability on the long panels

Twice in one session a feature existed and could not be found: the Start ComfyUI
button at the bottom of Settings, and the Listening panel below four stacked
Activity panels. Both were fixed by moving one thing, which is a symptom-level
fix. If it recurs, the answer is structural — tabs or anchors on Activity —
rather than relocating another control.


### Rented hardware — "what could I do with a card I do not own?"

Decided 2026-08-20, after rentals came up as a way around being locked to one
graphics card. Today's question is what *your* hardware can do; this is the
later one, and the reasoning is recorded so it is argued with rather than
rediscovered.

The product fit is real. Today RigMatch says a 70B is out of your league and
stops. The rental version finishes the sentence: *out of your league on this
card — a good match on a rented 48 GB one, around $0.40 an hour.* The
matchmaking frame already carries it: a model your rig cannot date locally is
not unreachable, it is long-distance.

The seam already exists, too. A rental is a **network host somebody else
racks** — RigMatch already scans for remote Ollama instances, lists their
models and manages them per host. The feature is teaching it that some hosts
are rented, with a price per hour and a lifetime.

**What has to be true first**

- **A score must be stamped with the rig that produced it.** See KNOWN_ISSUES —
  this is a live bug, not a rental one. Under rentals it would poison every
  score.
- **The network-host path needs its first real exercise.** It has a scanner and
  demo data; it has likely never been driven against a genuine remote host under
  test. A cheap pod running Ollama is exactly the rig for that.
- **Cost honesty.** The app never invents numbers about speed and must not
  invent them about money. Price per hour comes from the user or the provider,
  never estimated, and a finished run should say what it cost.

**Explicitly out of scope, even later:** RigMatch running *on* the rental (the
app stays on your desk; the rental is a host it talks to), and any reselling or
brokering of compute.

### ~~VRAM-tier simulation in the gates~~ — done 2026-08-21

Shipped in `tests/vramTiers.test.mjs`, and more cheaply than planned. The
proposed environment override turned out to be unnecessary: the fit functions
already take VRAM as an argument, so eight tiers from 0 GB to 48 GB are
reachable from a test with no app changes at all.

What it holds is the invariant, not the wording — chiefly that a bigger card is
never described as worse for the same goal, which hand-written thresholds get
wrong easily and nobody testing on one card would ever see.

### Code Challenge — multi-language, judge-graded coding test

A skill test that asks a model to solve a coding task in a language you choose
(Python, Go, Rust, SQL, …), graded by the LLM judge. The counterpart to App Builder
for code that isn't a runnable web app — kept separate precisely because it can't be
executed/previewed the way App Builder is. Reuses the judge, run flow, result viewer,
and improve loop. Full design in [docs/code-challenge-spec.md](docs/code-challenge-spec.md).

### Web version — marketing site + embedded demo

> **Shipped (July 2026):** GitHub Pages now serves a marketing landing page at the
> site root (`site/index.html`) with the interactive preview-mode demo one click
> away at `/app/`. Shared scorecards link to the landing page, completing the
> scorecard → landing → demo/download funnel. Remaining polish: real screenshots
> on the landing page (currently a CSS scorecard mock), and repointing links if a
> custom domain is added.

Turn the current GitHub-README-as-homepage into a real `rigmatch.ai` marketing site, with the existing browser **preview mode** (`fallbackApi`, mock data) embedded as a one-click "try it" demo. The desktop app stays the real product; the site is top-of-funnel.

**Why:** distribution. A niche desktop utility lives or dies on discovery, and a shareable URL beats a `.exe` on a Releases page. The interactive demo already exists for free (the app already runs in the browser via `npm run dev:web`).

**Explicitly _not_** a functional replacement: a browser can't read VRAM/GPU accurately, so the **Fit** pillar degrades to a guess. A "browser drives your local Ollama" mode (needs `OLLAMA_ORIGINS` + Private Network Access handling) is possible but low-value — most people who can run Ollama can install the app. Skip unless users ask.

**Effort:** landing page + embedded demo = days (reuses existing code). Full browser-based local testing = ~week, worse product.

**Decision gate:** is the degraded (browser-estimated) Fit score acceptable for the demo? If yes, ship the marketing site. If Fit fidelity is sacred, keep it desktop-only and just build a static marketing page.

### Cloud comparison mode — OpenRouter as a reference baseline

Let users benchmark **online models via OpenRouter** alongside their local ones, framed as an honest _local-vs-cloud measuring stick_ — "is a cheap cloud model good enough, or do you need local?" — **not** as more contestants for the local leaderboard.

**Why:** the real user question is often "do I even need local?" RigMatch can answer it on the one axis that's directly comparable — quality on the same question set.

**Plumbing is easy:** OpenRouter is an OpenAI-compatible REST API (`https://openrouter.ai/api/v1/chat/completions`, bearer key, SSE streaming) — same `fetch` pattern as Ollama. Add `'openrouter'` to the existing provider abstraction (`LocalModelProvider` + `baseUrl`/`providerLabel` in `types.ts`).

**Scoring is the real work — the current Match Score breaks for cloud models.** Of the four pillars (`main.cjs` → `total = speed·0.32 + quality·0.34 + stability·0.18 + fit·0.16`):
- **Quality** (34%) — transfers perfectly; the shared, comparable axis.
- **Speed** (32%) — measures OpenRouter's servers + your internet, not your rig. Apples-to-oranges.
- **Stability** (18%) — conflated with network jitter.
- **Fit** (16%) — meaningless; `scoreRigFit()` scores fit in _your_ VRAM, which a cloud model doesn't use.

So don't mix cloud models into the local Match Score board (a datacenter 70B would crown itself Top Match and undermine the whole premise). Instead: a separate **"Cloud Reference" track/mode** sharing the quality axis, swapping the meaningless pillars for cloud-appropriate ones — **cost per 1M tokens, latency, context window, privacy (local = 100 / cloud = 0)**.

**Brand cost:** punctures the "100% local, nothing leaves your computer" promise (API key, per-token cost, prompts go to cloud). Must be clearly opt-in and walled off from the local core.

**Practical notes:** skip the 3×-per-question runs for cloud (jitter makes stability noise — saves money); show an estimated cost _before_ running; store the API key carefully (it's a paid credential, unlike anything else in the app).
