# RigMatch.AI — Roadmap

Ideas parked for later. Nothing here is committed; it's a candid backlog of directions worth exploring.

---

## Backburner

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
