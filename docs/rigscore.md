# RigScore: a score you can set beside another computer's

Decided 2026-10-12 with Dave. Builds the roadmap's "community score database", pulled forward from 1.0+, in an order that keeps the data promise.

## The question

The Match Score answers "which model suits my PC". It cannot be compared across computers: answer quality belongs to the model, and fit belongs to the card. RigScore answers a different question, "how fast is my PC at local AI", with a number that means the same thing on every computer.

LocalScore already publishes speed leaderboards from thousands of runs, so RigMatch will not win on breadth. What it can add is a speed score from the same app that measures quality and fit on the same machine.

## What a score is

- **Fixed work.** Every computer runs the same prompts on the same weights with the same settings (`RIG_WORKLOAD` in `src/lib/rigScore.ts`). Anything that changes a speed is in there, and its `version` moves when any of it changes. Scores of different versions are never set side by side.
- **Tiers**, like 3DMark's: Light (`llama3.2:3b`), Standard (`qwen3:8b`), Heavy (`qwen3:14b`), Extreme (`qwen3:30b-a3b`). A PC that cannot hold a tier shows "not run" for it, never zero.
- **Measured per tier:** prompt processing and generation, in tokens per second, as the median of 3 timed runs after a warm-up, plus the model load time.
- **Points:** 1000 at a written-down reference machine. Twice as fast at both halves is 2000. The two halves are combined as a geometric mean, so neither can hide the other.
- **Headline:** the Standard tier, which most computers that run local AI can hold. The other tiers are shown beside it.
- **Separate from the Match Score.** Never blended into it.

## What goes with every score (the rig stamp)

GPU, VRAM, driver, Ollama version, app version, the digest and quantization of the weights, the workload version and the context size. Two results are set side by side only if the weights, the workload version and the context size match. A different Ollama or driver is compared with the difference named, because speeds do move with them (the same card drifted 12 to 18 percent between two days).

## Where other computers' numbers come from

Opt-in, one result at a time, no server at first:

1. A "Submit my result" button opens a prefilled GitHub issue holding the score and the rig stamp, the same pattern as the feedback link. Nothing is sent from the app, and nothing leaves until the person presses Submit on GitHub.
2. Accepted results are merged by hand into a table in the repo.
3. A leaderboard page on the site is built from that table.

This holds to a few hundred entries and costs nothing. A server is the step after, if it is ever needed, and it needs a privacy policy first.

The submission carries the rig stamp and the scores only: no host name, prompts, transcripts or file paths.

## Phases

1. **Core** (done): `src/lib/rigScore.ts` and its tests. Tier models, the workload, the medians, the points, and whether two results can be compared.
2. **Runner** (done): `electron/rigScoreRunner.cjs` behind the `rigscore:run` IPC. It runs the fixed workload on the local Ollama and returns the per-run timings and the machine's stamp; `src/lib/rigScoreRun.ts` turns them into a `TierMeasure` and a `RigStamp`. It never pulls: a missing model comes back as not installed, and the screen offers the download through the usual consent dialog, with its size.
3. **Reference** (Light done, 2026-10-24): measure the reference machine for each tier and write the numbers into `RIG_REFERENCES`. Standard and Heavy need qwen3:8b and qwen3:14b on the reference machine; Extreme needs a 24 GB card, which the reference machine does not have.
4. **Screen** (done, card to follow): My PC › Speed score in Advanced Mode, with the tiers, the stamp, a plain-English speed scale and the history. The shareable card is still to do.
5. **Submit and compare**: the GitHub submission, the table, the leaderboard page.

## Open

- **The reference machine** is the RTX 4070 12 GB on Ollama 0.35.1, Dave's own machine, so the number is one that can be checked. Light is measured; the other tiers are pending (phase 3).
- **The fixed passage** is written (`src/lib/rigScorePassage.ts`) and lands at 1,486 tokens on llama3.2 and 1,495 on qwen3. Each run opens with its own line, because Ollama skips the part of a prompt it has just read.
- **Pinning by digest.** The tags can move. Each result records the digest of the weights file (the modelfile's FROM line, not the manifest's), and a result on other weights gets no points against the reference and is not compared in the history.
- **Machines with unified memory** (Apple Silicon, Jetson) have no VRAM figure, so every tier is offered, and a tier too large for the memory has to fail clearly.
- **Remote hosts** are out. RigMatch cannot read another computer's card, so a score from one has no honest stamp.
