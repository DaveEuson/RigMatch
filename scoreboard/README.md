# Scoreboard

Speed score results from many computers, anonymous, grouped by graphics card. It runs as a Cloudflare Worker on the free plan with a D1 database: nothing runs on your PC, and the Worker only runs when a request comes in.

- `worker.ts`: the Worker's entry
- `scoreboard.ts`: what it does: take a result, check it, keep it, serve the board
- `../src/lib/rigScoreSubmit.ts`: what a shared result is. The app builds it and the Worker checks it, so both use the same rules.
- `migrations/`: the database tables
- `PRIVACY.md`: what is kept and what isn't

## What it answers

- `POST /v1/results`: one result, as JSON. Answers 201 when saved, 200 for a duplicate, 400 with the reason when refused, and 429 after 30 from one address in a day.
- `GET /v1/cards?tier=standard`: the board for one tier (`light`, `standard`, `heavy` or `extreme`). It gives each card's result count, median speeds and points against the reference machine (1000). Only results on the reference's own model file are ranked. Any web page can read it, and it's cached for 5 minutes.

## Free plan limits

Checked 2026-11-07:
- 100,000 requests a day
- 5 million database rows read a day
- 100,000 rows written a day
- 500 MB for the database

Past a limit, the Worker returns errors until midnight UTC, and nothing is billed. Nothing costs money unless you move to a paid plan yourself.

## Set it up (once, about 20 minutes)

Run these in a terminal, in this `scoreboard` folder. `npx` fetches Wrangler, Cloudflare's own command-line tool, pinned to 4.152.0.

1. Make a free Cloudflare account at https://dash.cloudflare.com/sign-up and turn on two-factor login. The free Workers plan doesn't ask for a card. If any step here does, stop there: all of this is meant to run without one.
2. Log Wrangler in. A browser page opens; approve it there:
   ```
   npx --yes wrangler@4.152.0 login
   ```
3. Make the database:
   ```
   npx --yes wrangler@4.152.0 d1 create rigmatch-scoreboard
   ```
   It prints a `database_id`. Paste it into `wrangler.toml` in place of `PASTE-THE-DATABASE-ID-HERE`. The id isn't secret: only your logged-in account can use it.
4. Make the tables:
   ```
   npx --yes wrangler@4.152.0 d1 migrations apply rigmatch-scoreboard --remote
   ```
5. Publish the Worker. The first time, it asks you to pick a `workers.dev` subdomain:
   ```
   npx --yes wrangler@4.152.0 deploy
   ```
   It prints the address, for example `https://rigmatch-scoreboard.<your-subdomain>.workers.dev`.
6. Check it: open that address with `/v1/cards` at the end. It should show the Standard board with no cards yet.

The address then goes into the app for its Share button. The button isn't built yet.

## Looking after it

Newest results:
```
npx --yes wrangler@4.152.0 d1 execute rigmatch-scoreboard --remote --command "SELECT id, received_on, tier, gpu, vram_gb, decode_tps, prefill_tps FROM results ORDER BY rowid DESC LIMIT 20"
```

Take a junk result off the board (it stays in the database, hidden):
```
npx --yes wrangler@4.152.0 d1 execute rigmatch-scoreboard --remote --command "UPDATE results SET hidden = 1 WHERE id = 'the-id'"
```

After changing the code here, publish again with step 5. After adding a file to `migrations/`, run step 4 first.

## Tests

`tests/scoreboard.test.mjs` runs the scoreboard against Node's own SQLite with these migrations applied. D1 is SQLite, so the real SQL runs. They're part of `npm test`.
