# Context endurance: where a model slows down as the context grows

## The question

Every RigMatch test runs at a short context (`num_ctx` 2048). A model that is fast there can crawl at 16K, and nothing says so. llmfit and llm-checker estimate this; RigMatch measures it, on the person's own card.

## What it does

For one installed model, through the user's own Ollama, it runs three stages and reads back what Ollama itself reports:

| Stage | Context | Prompt |
|---|---|---|
| Quick chat | 2K (2,048) | about 300 tokens |
| Long page | 8K (8,192) | about 6,100 tokens |
| Whole project | 16K (16,384) | about 14,300 tokens |

The prompt is a fake server log with a passkey hidden 55% of the way in. The reply is asked for as JSON only, 128 tokens at temperature 0, thinking off. Each stage reports the prompt Ollama counted, the writing and reading speed, the load time, how much of the model is on the graphics card (`/api/ps`, `size_vram / size`), the context Ollama really gave it (`context_length`), and whether the passkey came back. Writing is how fast the answer comes out, reading how fast the prompt goes in.

The first stage's speed is the baseline. A model that is fast at 2K and slow at 16K says so; one that is simply slow says that too, because the verdict compares each size with the model's own 2K speed.

It takes about a minute for a 3B model and two or three for a 14B on a 12 GB card, more if the model stops fitting. The app and the command line say the estimate before starting, and the person starts it.

## The verdict

The first size that fails any of three tests is where the model gives out:

- **Speed**: writing falls under **55%** of the 2K speed.
- **Card**: less than **92%** of the model sits on the graphics card.
- **Passkey**: it did not come back.

The words: "Holds up to 16K on your card", "Slows down past 8K: part of the model moves to system memory", "Part of the model moves to system memory past 8K", "Loses the middle of long inputs past 8K". "Past 8K" means 8K passed and 16K did not.

### Where the thresholds come from

One real run on 2026-10-26: an RTX 4070 12 GB, Ollama 0.35.1 on its defaults (`OLLAMA_NUM_PARALLEL=1`, flash attention off), three models, one run each. Writing speed in tokens a second:

| Model | 2K | 8K | 16K | Kept at 16K | On the card at 16K |
|---|---|---|---|---|---|
| llama3.2:3b | 167 | 131 | 102 | 61% | 100% |
| qwen3:8b | 74 | 61 | 50 | 67% | 100% |
| qwen3:14b | 42.5 | 38 | 13 | 31% | 87% |

The passkey came back in every stage. A longer context costs any model a third to 40% of its speed, and the 3B and 8B stayed whole on the card, so 55% sits between that ordinary cost and the 14B's fall. 92% sits between 100% and 87%. The 14B's 9.3 GB of weights plus the 16K cache no longer fit in 12 GB, so some layers moved to the processor: reading fell from 2,021 to 394 tokens a second and writing to 13.

**These fit three models on one card.** They are the constants `ENDURANCE_SPEED_KEPT_MIN` and `ENDURANCE_ON_CARD_MIN` in `src/lib/contextEndurance.ts`, to be moved when more cards' numbers are in. A card that slows an ordinary model past 45% at 16K would flag a healthy one. Everything the app and the command line print says the cut-offs are a guide.

## What the first run got wrong, and the checks that came of it

1. **Ollama silently truncates a prompt longer than the context**, to about half of it (2,050 / 4,098 / 8,194 tokens for contexts of 4K / 8K / 16K). The call succeeds; the only trace is `truncating input prompt` in `server.log`. The first run sized its prompts from a calibration that Ollama had already cut, so the long prompts were far too big, the passkey went with the cut, and every model looked as if it had lost it. So tokens per line are **measured on two small prompts well under the context**, never assumed (30 to 37 tokens a line across tokenizers; an outside suggestion assumed 22), and after every stage the prompt Ollama counted must be within 15% of the target. A stage that is not is marked "wrong size", left out of the verdict, and said so. It is never reported as the model's failure.
2. **A fresh random first line in every prompt**, so no cached prefix is reused and the reading speed is honest (RigScore does the same with its "Reading N." line).
3. **Each stage changes `num_ctx`, so Ollama reloads the model.** Load time is reported on its own and is not in the speeds. The first load happens during the calibration, at the first stage's size.
4. **Thinking models need `think: false`.** It reuses the benchmark's request body and its fallback for an Ollama that refuses the parameter.
5. **The cliff moves with what else is using the card**: the same 14B slowed at 8K in an earlier, discarded run when the desktop was using about 4 GB, and only at 16K when it used 1.7 GB. The card is read before the check (the app's own contention check) and named in the result, and a busy card is warned about plainly.
6. **`context_length` from `/api/ps`** is read after each stage. If it is smaller than what was asked for (`OLLAMA_NUM_PARALLEL` above 1 splits the context between slots), the result says so.
7. **Never beside another program's model.** It does not start while Ollama has anything loaded, ends the run and keeps nothing if something else loads during it, unloads only what it loaded, and Stop or Ctrl+C unloads. Ollama on this computer only. LM Studio has no `/api/ps`, so it says it is not supported there. Another program's request for a different model also makes Ollama unload an idle model to make room for it, so a model that has gone from `/api/ps` right after its own stage ends the run the same way: this happened on a shared GPU twice while this was being built, and the first time left the 16K stage with no share on the card to read.

## The check against the first run

Run again with this code on the same card, one model at a time with nothing else using Ollama (2026-10-26, from the built `rigmatch-fit --endurance`, and once through the desktop app):

| Model | Writing at 2K / 8K / 16K | Kept at 16K | On the card at 16K | Verdict |
|---|---|---|---|---|
| llama3.2:3b | 174 / 135 / 104 | 60% | 100% | Holds up to 16K |
| qwen3:8b | 77 / 67 / 54 | 71% | 100% | Holds up to 16K |
| qwen3:14b | 46 / 40 / 15.4 | 34% | 87% | Slows down past 8K: part of the model moves to system memory |
| qwen3:14b, in the app | 45 / 40 / 12.9 and 45 / 39 / 12.5 | 29% and 28% | 87% | the same |

The writing speeds agree with the first run within about 10% (the one exception is the command line's 16K run of the 14B at 15.4 against 13; the two app runs read 12.9 and 12.5), the share on the card is the same 87%, and the verdicts match. Reading speed does not agree: the 14B read the 16K prompt at 1,378 to 1,483 tokens a second here against 394 in the first run, and 2,221 to 2,258 at 2K against 1,345. The first run's reading speeds were lower for every model and size, its 2K stage came straight after a reload at another context, and other sessions were using the PC then. Not explained, and not relied on: the thresholds use writing speed and the share on the card only. The 3B keeps 60% at 16K, not far over the 55% line.

## Where it lives

- `electron/enduranceRunner.cjs`: the prompt builder, the calibration, the size check and the timing. Shared by the app and the command line, and free of Electron.
- `src/lib/contextEndurance.ts`: the stages, the thresholds, the verdict and the wording.
- `src/lib/rigScoreSession.ts`: the app's one session. A check takes the speed test's slot in the main process (`activeRigScore`), so it is never beside a show or a speed test, and Stop and quit end it the same way.
- `src/components/ContextEndurance.tsx`: My PC › Speed score, in Advanced Mode.
- `cli/endurance.ts`, `cli/enduranceCommand.ts`: `rigmatch-fit --endurance <model> [--json]`.

## Open

- **One card.** The thresholds, the time estimate and every number above are from an RTX 4070 12 GB. The estimate of reading speed (fifteen times the writing speed) and of writing speed from the size alone (300 GB/s over the weights) are rough on other cards. A 24 GB card, an AMD or Apple one, and a 6 GB one have not been looked at.
- **One kind of prompt.** A fake log and one passkey say nothing about answer quality at long context beyond finding that one thing.
- **Ollama defaults.** Flash attention and KV-cache quantization move the cliff, and are not varied.
