# Where RigMatch is pointed

One decision per section, with the reasoning attached, so future arguments can
be had against the reasoning rather than from scratch.

## Now, through 1.0 — "What can I do with *my* hardware?"

The question RigMatch answers is about the machine on your desk. Everything in
scope serves that: read the real card, test on it, score on it, stamp the score
with it, and refuse to make anything up. The 0.7 test plan and release
checklist define done. Nothing below this line blocks 0.7 or 1.0.

## Later — "What could I do with *rented* hardware?"

Decided 2026-08-20: rental GPUs (RunPod and the like) are a roadmap feature,
not a current one.

The product fit is real. Today RigMatch tells you a 70B model is out of your
league and stops there. The rental version of that sentence is better: *out of
your league on this card — a good match on a rented 48 GB one, around $0.40 an
hour.* Matchmaking already frames the whole app; a model your rig cannot date
locally is not unreachable, it is long-distance.

The seam already exists. A rental is just a **network host** somebody else
racks: RigMatch already scans for remote Ollama instances, lists their models
and manages them per-host. The feature is teaching it that some hosts are
rented — with a price per hour, a lifetime, and hardware that is not yours.

### What has to be true first (prerequisites, not features)

- **A score must be stamped with the rig that produced it.** Confirmed by
  reading the code on 2026-08-20, and it is a live bug rather than a rental
  one: `rigStampForModel` in `src/App.tsx` reads `system.gpu.*`
  unconditionally, while `getHostBenchmarkBlocker` permits a remote Ollama
  host that reports ready and `getModelRuntime` sends that row's requests to
  the host's own `baseUrl`. So a model benchmarked on another machine is
  scored there and stamped *here* — the local card, VRAM and driver.

  Anyone with Ollama on a second box on their LAN can reach this today; under
  rentals it would poison every score. It is a falsehood produced by the exact
  mechanism built to stop scores being credited to the wrong hardware, which
  makes it worse than an ordinary bug.

  Not yet fixed: the honest stamp for a remote run is "this ran somewhere
  else, and RigMatch does not know that machine's card", which means
  `ScoreRigStamp.gpu` and `vramGb` stop being guaranteed and every consumer —
  the match card, the retest badge, the crowning rules — has to handle their
  absence. That is a real change, not a one-liner, and it wants doing
  deliberately rather than squeezed in beside a release.
- **The network-host path needs its first real exercise.** It has demo data
  and a scanner; it has likely never been driven against a genuine remote
  host under test. A cheap pod running Ollama is exactly the rig for that.
- **Cost honesty.** The app never invents numbers about speed; it must not
  invent them about money. Price-per-hour comes from the user or the provider
  API, never estimated, and a finished run should say what it cost.

### Explicitly out of scope, even later

- RigMatch itself running *on* the rental. The app stays on your desk; the
  rental is a host it talks to. (The shipped build is Windows; pods are Linux;
  and the product's home is the machine in front of you.)
- Reselling, brokering, or bundling compute. RigMatch recommends; the user
  rents from the provider directly.

## Also parked, smaller

- **VRAM-tier simulation in the gates** — a dev-only profile override
  (`RIGMATCH_FAKE_VRAM=8/16/24`) so fit labels, sweet-spot copy and
  recommendations are swept across tiers automatically instead of only ever
  being seen on a 12 GB card. Free to build, closes the fit-logic blind spot
  that being locked to one card creates. Good first post-0.7 task.
- **Beta testers with different cards** at release — the coverage no rental
  or simulation buys: real Windows machines, real mics, real games, real
  SmartScreen.
