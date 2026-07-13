# Code Challenge — feature spec

Status: **proposed** · Depends on: the judge infrastructure shipped in 0.3.3
(`judgeAppBuilder`, `appRunnability`, the skill-test run flow).

## One-liner

A new skill test that asks a model to solve a coding task **in a language you
choose** (Python, Go, Rust, SQL, …) and grades the answer with the LLM judge —
the counterpart to App Builder for code that isn't a runnable web app.

## Why it's a separate test (not a language dropdown on App Builder)

App Builder's whole value is that a single-file HTML app **runs instantly** in a
sandboxed iframe — that's what powers the live preview, the syntax/runnability
check, and gives the judge something that actually executes. The moment the output
is Python or Rust, all of that disappears: no preview, no run-check, nothing to
render. So a language selector on App Builder would quietly gut the thing that
makes it trustworthy.

The Code Challenge accepts that trade deliberately: **no execution, judge-graded**.
It exists precisely because we now have a judge good enough to reason about code
correctness (it already catches bugs like "treats a flat array as a 2D grid" in
App Builder). Keeping the two tests separate keeps each one honest about what it
can verify.

## User flow

1. In the run dialog's **Skill Tests** section, a new **Code Challenge** option
   sits beside **Build an app**.
2. When selected, it reveals:
   - **Language**: Python · JavaScript · TypeScript · Go · Rust · SQL · Java ·
     C++ · Bash · "Let the model choose".
   - **Task**: presets (see below) or a **custom prompt**.
3. **Requires a judge.** Code can't be graded by the built-in heuristic (it only
   knows the App Builder / Q&A shapes). If "Answer grading" is still on Fast, the
   Code Challenge option is disabled with a note: *"Turn on Judge grading — code
   can only be graded by a model that reads it."* (Or: auto-switch grading to
   Judge when Code Challenge is picked, and say so.)
4. The run streams the model writing the solution (reuse the live-build view),
   then the judge grades it, then the result opens in a viewer showing the code +
   grade + the judge's one-line reason.

### Task presets (language-agnostic where possible)

- **Fix the bug** — given a short buggy function, return a corrected version.
- **Classic algorithm** — e.g. "reverse a linked list", "two-sum", "LRU cache".
- **Parse / transform** — "parse this CSV into records", "flatten nested JSON".
- **Idiomatic utility** — "a debounce function", "retry with backoff".
- **SQL: top-N-per-group** — (SQL only) "top 3 earners per department".
- **Custom** — free-text task in the chosen language.

Presets should carry a short **reference solution** (hidden from the model) that
is handed to the judge as grounding — the judge grades *against* it, which sharply
improves grading accuracy over "grade this in a vacuum".

## Verification model — the honest core

Grading is **judge-only by default**. The judge reads `{language, task, reference?,
the model's code}` and returns `{score 0-100, reason}` — same shape and module
pattern as `judgeAppBuilder`. Generalize that into a shared `judgeCode({ language,
task, reference, code, generate })`.

The interesting design axis is **tiered verification** — some languages *can* be
run in-browser for ground truth, and the spec should plan for it even if v1 skips
it:

| Tier | Languages | How | Grade source |
|---|---|---|---|
| **A — executed** | JavaScript / TypeScript | native (sandboxed iframe + test cases), TS transpiled first | run test cases → objective pass/fail, judge as tiebreak on style |
| **A — executed (WASM)** | Python, SQL | Pyodide (Python), sql.js (SQLite) run test cases in-browser | objective, but ships ~5–10 MB WASM per runtime |
| **B — judged only** | Go, Rust, Java, C++, Bash, … | can't run client-side | judge reasoning only |

**v1: ship Tier B for every language** (judge-only) — it reuses everything and
ships fast. **v2: add Tier A for JS/TS** using the existing `appRunnability`
sandbox plus a tiny test-case harness (this is the highest-value upgrade: real
pass/fail for the most common language, no new heavy dependency). **v3 (optional):
Pyodide / sql.js** behind an opt-in download, since they're large.

Always **label the grade's provenance** in the result (as we do elsewhere):
"Judged by qwen2.5-coder" vs "Passed 8/10 test cases" — never let a judge-only
score masquerade as verified execution.

## Grading prompt (judge)

```
You are a strict {language} code reviewer. Grade ONLY whether the solution is
correct and complete for the task — do not rewrite it.

TASK: {task}
{reference ? "A correct reference approach: ```{reference}```" : ""}
SOLUTION:
```{language}
{code}
```

Check: does it correctly solve the task? Handle edge cases? Compile/parse without
errors? Is it complete (no stubs/TODOs) and idiomatic {language}?

Scoring: 0-25 wrong/won't compile · 30-55 partially works · 60-80 works with bugs
· 85-100 correct and clean.

Respond with ONLY: {"score": <0-100>, "reason": "<one sentence>"}
```

Reuse `parseAppJudgeVerdict` (rename to `parseJudgeVerdict` — it's already generic).

## Result display

The Code Challenge output is code, not an app, so the viewer leads with the
**code** (the "View code" panel from `DemoResultModal`, promoted to primary) plus:

- Grade + score + judge reason ("Judged working" → "Judged correct").
- **Copy code**.
- **Improve / Improve with a hint / Auto-improve** — the same self-repair loop
  works here (feed the judge's diagnosis back). Big reuse win.
- No "Play It" (nothing to run) — unless Tier A, where a "Ran N/M tests" chip
  replaces it.

## Reuse map

| Piece | Reuse | New work |
|---|---|---|
| Judge call + parser | `judgeAppBuilder` / `parseAppJudgeVerdict` → generalize to `judgeCode` | small |
| Run flow / streaming | `runSkillTestsAfterRun`, live-build view | add a `code-challenge` job kind |
| Result viewer + retry | `DemoResultModal`, `runImprovePass`, `buildAppBuilderRetryPrompt` | code-first layout; a `buildCodeRetryPrompt` |
| Run-dialog UI | Skill Tests section pattern | language + task selectors |
| Storage | `AdvancedLabResult` / `labResults` | add `challenge: 'code'` + `language` |
| Grade | `getAdvancedLabGrade` | reuse |

## Effort

**Medium.** v1 (judge-only, all languages, presets + custom, result viewer with
improve loop) is roughly the size of the App Builder judge + a couple of run-dialog
controls — most of the machinery already exists. v2 (JS/TS test-case execution) is
a self-contained follow-up.

## Decisions needed before building

1. **Judge requirement UX** — disable Code Challenge when grading is Fast, or
   auto-enable Judge and tell the user? (Lean: auto-enable + a clear note.)
2. **Language list** — the set above, or trim to the ones people actually test
   (Python / JS / TS / Go / Rust / SQL)?
3. **Reference solutions** — worth authoring for presets (better grading) vs
   judge-in-a-vacuum for v1 (faster to ship)?
4. **Is v1 judge-only acceptable** given no ground truth? (It's the same honesty
   bar as the App Builder judge, which users have found useful — but say so.)

## Risks & honest caveats

- **No ground truth in v1.** A weak judge gives weak grades; this is only as good
  as the judge model. Strongly bias users toward a coder/cloud judge for this test
  (same guidance as App Builder). Tier A (v2) is what fixes it for JS/TS.
- **Scope creep toward "a coding benchmark."** Keep it a *skill test* (a separate
  Lab Grade), not part of the core Match Score — code ability shouldn't silently
  reweight the "which model fits my rig" number.
- **Cost/latency with a cloud judge** scales with languages × tasks; keep the
  default a single task per run unless the user opts into more.
