# Two demo scripts

Written against the app as it stands at 0.7. Every screen, label and number
below is one that actually exists — no invented UI, no rounded-up claims.
Verified 2026-08-20: twelve goal tiles across five groups, and the companion
strings quoted here are the ones in the build.

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
| 2 | Cut to RigMatch first screen | The goal picker, twelve tiles in five groups | "RigMatch starts somewhere else — with what you actually want." | 8–15 |
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

**The optional tag, and why it is optional**

You can add eight seconds of RigMatch Chat making a picture after shot 9. It
tests well with this audience and it is the most immediately impressive thing
the app does.

It also changes what the video promises. Video A sells one idea — *find out
which AI suits your computer* — and image generation quietly turns that into
*this app does AI stuff*, which is every other app's pitch. If you want the
picture, consider making it its own short rather than a tail on this one.

---

## Video B — for people who already run models locally

**Length:** 2:45–3:00. **Audience:** r/LocalLLaMA, people with Ollama already
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
| 5 | Scorecards, one crown per goal | Multiple crowns, per goal | "One winner per goal. A coder and a painter cannot lose to each other, so it stops pretending they can." | 42–54 |
| 6 | Hover a score with the rig stamp | Card, driver, weight fingerprint | "Every score records the card, the driver and the exact weights. Change any of them and the score badges itself for a retest instead of quietly still counting." | 54–70 |
| 7 | Activity → Listening test | The transcript vs the script, score | "The listening test is the one score here measured against a right answer. Word for word against a known passage." | 70–84 |
| 8 | Chat: "draw me a picture of a lighthouse" | The honesty note appears, model's reply beneath | "Ask a text model for a picture and it tells you it cannot make one — before the model cheerfully describes one and calls it done." | 84–100 |
| 9 | Cut to RigMatch Chat opening | The buddy list, AIM-style, avatars per family | "Picture-making lives here. This is the companion — your models as a buddy list." | 100–110 |
| 10 | Click **Read a picture** in "What do you want to do?" | The list narrows to three, each tagged `SEES` | "It asks what you want to do, and the list answers. These three can look at a picture. One can listen." | 110–124 |
| 11 | Click **Make a picture** | Every buddy drops out; the **IMAGE MAKER · Ready · sdxl-turbo** card takes their place | "And this one is honest twice over. No chat model makes pictures — so none of them stay in the list, and the thing that will is named. If ComfyUI is not running it says Not ready instead of letting you find out." | 124–142 |
| 12 | Open the maker, type a prompt, press **Make image ↗** | The workspace: prompt kept beside its result, rising seconds, then the picture | "It is not a chat — nothing is pretending to talk back. Elapsed seconds, not a fake progress bar, and the file is in your Pictures folder, path shown." | 142–166 |
| 13 | Close on the Models table | — | "Free, offline, and it will tell you when it does not know. Link below." | 166–180 |

**Notes for the edit**

- Shots 3, 6, 8 and 11 are the argument. If the video has to lose time, take it
  from 4, 5 and 10 — never from these four.
- Shot 8 lands hardest with the model's answer visible underneath the note: the
  warning, then the model enthusiastically describing a lighthouse it did not
  draw. The contrast *is* the point, and it is the single most persuasive frame
  in the video for this audience.
- Shot 11 is the one most likely to be cut for pace and the one most worth
  keeping. "None of them" is a claim no competitor's demo makes about itself.
- Shot 12 on sdxl-turbo takes about 6–15 seconds — short enough to play in full.
  Do not cut it. An unedited timer is the proof.
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

### Two that will ruin a companion take

- **Only one RigMatch open.** RigMatch Chat connects to whichever RigMatch is
  running, and a second window cannot serve it. Two open means the companion may
  be listing the other one's models and saving the other one's pictures. 0.7
  refuses to start a second window at all, but check the taskbar before rolling
  rather than discovering it in the edit.
- **Pictures are shown for the session, not stored in the transcript.** Reopen a
  conversation and yesterday's image is its filename, not the picture — that is
  deliberate, so a history does not grow by a quarter-megabyte an image. Shoot
  shot 12 in one continuous take; do not close the companion and expect to film
  the result again afterwards.
- **ComfyUI must be up with an image checkpoint**, not a video one. The first
  checkpoint on this machine is a video model with no text encoder, and asking it
  for a picture fails with a CLIP error. Load sdxl-turbo before rolling.
