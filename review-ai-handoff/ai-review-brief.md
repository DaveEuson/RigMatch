# RigMatch.AI AI Review Brief

## Paste-Ready Prompt

You are reviewing RigMatch.AI, a local-first Windows/Electron app that helps users choose, download, test, and compare local Ollama AI models for their own computer.

The product concept is intentionally playful: a corny 1970s dating-show style where AI models are "contestants," the computer is the rig looking for a match, single-model tests are compatibility tests, multi-model comparison is "Speed Dating," the best model becomes the "Top Pick," and saved results live in "Scorecards."

Reference source for the intended metaphor:

- The Dating Game Wikipedia page: https://en.wikipedia.org/wiki/The_Dating_Game
- Relevant format cues: the show began in the 1960s, featured a chooser questioning hidden contestants, often asked the same question to multiple contestants, and the final choice was based on the answers. Use this as loose product inspiration, not as a literal clone.

The current product direction is that **Contestants should be the main hub**. Most users should spend their time there. From Contestants, users should be able to:

- browse available and installed local models,
- see the selected model,
- test one model,
- pick models for Speed Dating,
- start Speed Dating,
- manage the download queue,
- see the current top pick,
- jump to deeper details only when needed.

Please review the attached screenshots in order and give product/UX opinions. Be direct and specific. I want to know what is confusing, what is working, what still feels too wizard-like, and what should be changed next.

Focus on:

1. Whether Contestants works as the main hub.
2. Whether the first-time user can tell what to do next.
3. Whether "Test," "Pick," "Speed Dating," "Top Pick," "Downloads," and "Scorecards" make sense.
4. Whether the 1970s dating-show vibe is clear without hurting usability.
5. Whether the app still looks too steampunk or visually noisy.
6. Whether the download queue state and cancel behavior are understandable.
7. Whether Speed Dating should stay as a separate tab, become only a modal/detail view, or remain as both a hub action and a details tab.
8. What should be prioritized before showing this to beta users.

Please output:

- A short overall verdict.
- The top 5 UX problems, ranked by severity.
- The top 5 highest-impact improvements.
- Specific copy changes for confusing labels/buttons.
- Any layout changes you would make to the Contestants hub.
- Any visual-style changes to better hit "corny dating show" instead of "steampunk dashboard."
- Questions you would ask before making final design decisions.

Do not give generic advice. Ground every recommendation in the screenshots.

## Screenshots To Attach

1. `screenshots/01-contestants-hub.png`
   - Main default screen after app load.
   - Contestants is now the primary hub.
   - Shows selected test, Speed Dating, downloads, and current pick cards.

2. `screenshots/02-download-queue.png`
   - Contestants after queuing one downloadable model.
   - Review whether the queue state and cancel/start controls are clear.

3. `screenshots/03-speed-dating-details.png`
   - Deeper Speed Dating tab.
   - This is meant to show lineup, transcript/detail, and comparison results after the hub starts the workflow.

4. `screenshots/04-scorecards-ranking.png`
   - Scorecards and saved test rankings.
   - Review whether this feels like a useful history/ranking view.

5. `screenshots/05-first-run-guide.png`
   - First-run guide overlay.
   - Review whether it helps orient the user without blocking the app too much.

## Walkthrough For Reviewer

RigMatch.AI opens on **Contestants**. This is deliberate. Earlier versions opened on setup/rig status and felt too much like a wizard. The desired model is now: setup is important, but model selection and testing are the user's main workspace.

In **Contestants**, the top command cards are the intended "what do I do next?" area:

- **Selected Test**: run a one-model compatibility test or queue/download the selected model.
- **Speed Dating**: compare 2-5 picked installed models using the same questions.
- **Downloads**: show queued models and start/cancel downloads.
- **Current Pick**: show the current best saved match.

The table below is the model pool. Users can search, filter, pick models for Speed Dating, test installed models, download missing models, and remove installed models.

**Speed Dating** has a separate tab because it contains the detailed comparison view: lineup, show animation, transcripts, and eventual rankings. But the start action should be discoverable from Contestants.

**Scorecards** should become the ranking board for all saved tests, not just a generic history page.

The design target is playful but practical. The dating-show metaphor should add charm, but the app must still be clear enough for someone who just wants a local model that works well on their computer.

The best metaphor fit is the Q&A structure: the computer asks each model the same prompt cards, the contestants are judged by their answers, and RigMatch crowns the best match. The interface should lean into question cards, contestant numbers, stage/curtain language, and answer-based judging more than ornate mechanical/steampunk decoration.

## Current Known Concerns

- First-time users may still need clearer guidance on what "Test Selected" does versus "Start Speed Dating."
- The app has a lot of visual density.
- Some iconography and art direction previously felt more steampunk than 1970s dating show.
- Downloads were recently improved, but should still be reviewed for clarity.
- Scorecards should clearly rank all tests and make the best model obvious.
- The separate Speed Dating tab may be redundant if Contestants is the main hub, but it may still be useful for details.

## Review Goal

The goal is not to make the app more normal. The goal is to make the weird concept understandable, useful, and fun enough that a beta user can:

1. Open the app.
2. Understand that Contestants is the home base.
3. Pick or download a model.
4. Test one model or run Speed Dating.
5. See which model fits their computer best.
