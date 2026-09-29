# RigMatch — Roadmap

Ideas parked for later. Nothing here is committed; it's a candid backlog of directions worth exploring. Last reviewed September 2026, at 0.9.1.

---

## Next

### Refresh the screenshots

The README's screenshots in `docs/images` date from August and show the flat dark look that 0.9.1 replaced, and the landing page (`site/index.html`) still shows a CSS mock of a scorecard instead of the app. Both are the first thing a visitor sees. The screens can be regenerated at 1280 × 800 from the real app, driven against a stand-in Ollama so every state of a show can be captured without real models.

### A smaller download: drop the unused Chromium languages

About 47 MB of every install is Chromium's translations for languages RigMatch does not use. Electron can leave them out (`electronLanguages`), but not yet safely: 18 date and number formatting calls take their locale from Chromium's language list, so trimming it would give everyone US formats. Pass the system locale into those calls first, then trim.

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
  the right row: card, VRAM, driver, app version, model digest, quantization,
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
is still false for it, benchmark routing favors Ollama, and there is no setup
path.

Make LM Studio genuinely equal first, since it is the one users actually have.
A third — llama.cpp's server — then costs mostly catalog and detection work,
because it speaks the same OpenAI-compatible API. Doing them in the other order
means building the abstraction twice.

### Discoverability on the long panels

Twice in one session a feature existed and could not be found: the Start ComfyUI
button at the bottom of Settings, and the Listening panel below four stacked
Activity panels. Settings has since had the structural fix — a rail of sections
that jumps to each one. Activity still stacks its panels; if something gets lost
there again, give it the same rail rather than relocating another control.

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

- ~~**A score must be stamped with the rig that produced it.**~~ Done in 0.6.0:
  every score carries its rig stamp, and one measured on another machine is
  flagged instead of being crowned.
- **The network-host path needs its first real exercise.** It has a scanner and
  demo data; it has likely never been driven against a genuine remote host under
  test. A cheap pod running Ollama is exactly the rig for that.
- **Cost honesty.** The app never invents numbers about speed and must not
  invent them about money. Price per hour comes from the user or the provider,
  never estimated, and a finished run should say what it cost.

**Explicitly out of scope, even later:** RigMatch running *on* the rental (the
app stays on your desk; the rental is a host it talks to), and any reselling or
brokering of compute.

### Cloud comparison mode — OpenRouter as a reference baseline

Let users benchmark **online models via OpenRouter** alongside their local ones, framed as an honest _local-vs-cloud measuring stick_ — "is a cheap cloud model good enough, or do you need local?" — **not** as more contestants for the local leaderboard.

**Where it stands:** OpenRouter already works as an optional cloud *judge*: with a key, it can mark the answers local models give. Cloud models as contestants are not built, for the scoring reasons below.

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

---

## Decided

### Code signing — ship unsigned

Decided 2026-09-19. RigMatch is free and earns nothing, so the yearly cost is not spendable: $99 a year for Apple's developer program, and $120 to $400+ a year for Windows. Builds ship unsigned, which means SmartScreen and Gatekeeper warn on first launch.

What stands in for a certificate, at no cost:
- The release notes explain both first-launch warnings in plain words. The Windows `.zip` runs without installing and skips the SmartScreen prompt.
- `SHA256SUMS.txt` ships with every release.
- Since 0.9.0, every file carries a GitHub build attestation, so anyone can check it was built from this repository: `gh attestation verify <file> --repo DaveEuson/RigMatch`. That covers the integrity half of what a certificate does, though nothing about the warnings.

Revisit only if RigMatch starts earning. The order then is Apple first: $99 removes the macOS warning completely, with no reputation period to wait out.

---

## Done

### Code Challenge — July 2026

A judge-graded coding test in the language you choose (Python, Go, Rust, SQL, …), the counterpart to App Builder for code that can't be run as a web app. It is picked in the run dialog and needs a code-capable model and a judge. Design in [docs/code-challenge-spec.md](docs/code-challenge-spec.md).

### Web version — July 2026

GitHub Pages serves a landing page at the site root (`site/index.html`), with the interactive preview-mode demo one click away at `/app/`. Shared scorecards link to the landing page, completing the scorecard → landing → demo/download funnel. The demo runs on mock data, because a browser can't read VRAM or the GPU. Still to do: the landing page's real screenshots (see Next), and repointing links if a custom domain is added.

### Scores stamped with their rig — 0.6.0

Every score records the card, VRAM, driver, app version and model digest it was measured on, and a score from another machine or on changed weights is flagged instead of crowned.

### VRAM-tier simulation in the gates — August 2026

Shipped in `tests/vramTiers.test.mjs`, and more cheaply than planned. The
proposed environment override turned out to be unnecessary: the fit functions
already take VRAM as an argument, so eight tiers from 0 GB to 48 GB are
reachable from a test with no app changes at all.

What it holds is the invariant, not the wording — chiefly that a bigger card is
never described as worse for the same goal, which hand-written thresholds get
wrong easily and nobody testing on one card would ever see.
