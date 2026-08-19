# Two demo scripts

Written against the app as it stands at 0.7-dev. Every screen, label and number
below is one that actually exists — no invented UI, no rounded-up claims.

Two rules for both videos, taken from the app's own principles:

- **Never show a number the app would not stand behind.** If a score is demo
  data, the banner saying so must be in shot or the claim must be cut.
- **Show a real run, not a cut to the result.** The whole proposition is that
  the measurement is yours. Cutting from "start" to "winner" is the one edit
  that undermines the product.

---

## Video A — for someone who has never run a local model

**Length:** 75–90 seconds. **Audience:** curious, non-technical, has a gaming PC
or a decent laptop. **Where it plays:** social, autoplay, probably muted first —
so the on-screen text has to carry it alone.

**The one idea:** your own computer can run AI, and this tells you *which* one,
by trying them.

Avoid the words: VRAM, quantisation, inference, parameters, benchmark, local
LLM. The app itself explains "graphics card" rather than VRAM — match that.

| # | Shot | On screen | Narration | Secs |
|---|------|-----------|-----------|------|
| 1 | Ollama's model list in a browser, scrolling | Names only: `qwen2.5:7b`, `llama3.2:3b`, `gemma3:4b` | "Free AI you can run at home. This is the list. None of these names tell you anything." | 0–8 |
| 2 | Cut to RigMatch first screen | The goal picker, twelve tiles | "RigMatch starts somewhere else — with what you actually want." | 8–15 |
| 3 | Click **Everyday chat** | Tile highlights | "Say what you want it for." | 15–20 |
| 4 | Setup step reading the machine | The rig card: graphics card name, memory | "It reads your computer. Not a survey — the actual card in the actual machine." | 20–28 |
| 5 | Pick step, cards with size + fit | "Sweet spot" / size badges | "It picks a few that should fit, and says why each one might suit you." | 28–36 |
| 6 | Download step, progress bars | Real download running | "It downloads them." | 36–42 |
| 7 | Compare step running | Live answers scoring as they land, "about 5 minutes left" | "Then it asks all of them the same questions — on your machine — and marks the answers." | 42–55 |
| 8 | Winner screen | The board: every model, in order, with scores | "And tells you which one won *here*. Not on a server somewhere. Here." | 55–66 |
| 9 | Hold on the score, then the footer line | "Nothing leaves this computer" | "Nothing was uploaded. Nothing was sent anywhere. It all happened on your desk." | 66–78 |
| 10 | End card | RigMatch, free, link | — | 78–85 |

**Notes for the edit**

- Shot 7 is the shot. Let it breathe — it is the only proof that this is a
  measurement rather than a recommendation. Speed-ramp it if you must, but do
  not cut away.
- Shot 9 is the second-strongest claim and the cheapest to shoot. Do not skip it
  for time; cut shot 5 instead.
- If the run is slow on the day, pick a small model. A 3B finishing honestly
  beats a 7B finishing in the edit.

---

## Video B — for people who already run models locally

**Length:** 2:30–3:00. **Audience:** r/LocalLLaMA, people with Ollama already
installed and opinions about it. **Where it plays:** watched deliberately, sound
on.

**The one idea:** every score you have seen for these models was measured on
someone else's hardware. This measures yours, and refuses to make anything up.

This audience's first instinct is "that number is meaningless". The video should
get there before they do — the app's whole design is about not faking numbers,
so lead with the refusals.

| # | Shot | On screen | Narration | Secs |
|---|------|-----------|-----------|------|
| 1 | A leaderboard page | Any public benchmark table | "You have seen these. Every one of them was measured on hardware that is not yours." | 0–10 |
| 2 | RigMatch Advanced, Models screen | The table: size, quant, fit, status | "RigMatch runs the same models on your card and scores them there." | 10–20 |
| 3 | Start a run, warning dialog visible | The run dialog with the GPU-contention note | "It checks the card is free first. If something else is on it, it says so — a benchmark run against a busy GPU is a fiction." | 20–32 |
| 4 | Comparison running | Per-answer scores landing | "Same questions, same machine, one after another." | 32–42 |
| 5 | Scorecards, one crown per goal | Multiple crowns, per goal | "One winner per goal. A coder and a painter cannot lose to each other, so it stops pretending they can." | 42–55 |
| 6 | Hover a score with the rig stamp | Card, memory, driver, weight fingerprint | "Every score records the card, the driver and the exact weights. Change any of them and the score badges itself for a retest instead of quietly still counting." | 55–72 |
| 7 | Settings → judge options | Local vs cloud judge | "Prose has no shape to pattern-match, so it hands those answers to a second local model to mark. Never a paid cloud one unless you say so." | 72–86 |
| 8 | Activity → Listening test | The transcript vs the script, score | "The listening test is the one score here measured against a right answer. Word for word against a known passage." | 86–100 |
| 9 | Chat: "draw me a picture of a lighthouse" | The honesty note appears | "And the chat will not pretend. Ask a text model for a picture and it says it cannot make one — before the model cheerfully describes one and calls it done." | 100–115 |
| 10 | Press **Generate it here**, timer runs, image lands | Elapsed seconds, Stop button, then the picture | "If ComfyUI is running, it offers to actually make it. Elapsed time, not a fake progress bar, and a Stop that works." | 115–140 |
| 11 | Close on the Models table | — | "Free, offline, and it will tell you when it does not know. Link below." | 140–155 |

**Notes for the edit**

- Shots 3, 6 and 9 are the argument. If the video has to lose 30 seconds, take
  it from 4 and 5, never from these.
- Shot 9 lands hardest if you show the model's answer underneath — the note,
  then the model enthusiastically describing a lighthouse. The contrast *is* the
  point.
- Shot 10 is the only "wow" shot; on sdxl-turbo it takes about 6–15 seconds,
  which is short enough to play in full. Do not cut it — an unedited timer is
  the proof.
- Expect "why not just use X?" in the comments. The answer in one line: because
  X tells you what is good, and this tells you what is good *on your machine*.

---

## Recording notes for both

- **Window size:** 1440×980. The app is checked at that size, and the layout
  audit runs against it.
- **Mode:** Advanced for video B, Simple for video A. Simple Mode hides the
  ticker, so any status text you want on screen must come from the wizard.
- **Before rolling:** close anything using the GPU. The app will otherwise, quite
  correctly, put a "your graphics card is busy" warning across your demo.
- **The demo banner:** the web preview shows "Interactive demo — these scores are
  sample data". Record the desktop app, not the preview, or that banner is in
  every frame — and cropping it out would be the exact dishonesty the app spends
  its time refusing.
- **A real download takes minutes.** Pre-download the models, then delete one
  small one so shot 6 of video A has something genuine to show.
