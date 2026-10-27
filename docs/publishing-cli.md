# Publishing rigmatch-fit to npm

`rigmatch-fit` (the `cli/` folder) is published to npm under Dave's account when 0.10.0 ships. Until then `cli/package.json` says `"private": true`, which makes npm refuse to publish it, so nothing goes out by accident.

## What the 0.10.0 bump changes

In `cli/package.json`:

- remove `"private": true`
- set `"version"` to `"0.10.0"`, the app's version. From then on the CLI's version follows the app's at each release.

And in the main `README.md`, the "Command-line fit check" section can say `npx rigmatch-fit` instead of building from source.

## Publishing, after the 0.10.0 release is out

Run these from `C:\Users\davee\Projects\rigmatch-work`:

```bash
git pull --ff-only
npm ci
cd cli
npm pack --dry-run
```

`npm pack --dry-run` builds the CLI first (the `prepack` script runs `npm run build:cli` and copies the repo's `LICENSE` into `cli/`). Check that the file list it prints has these four, and nothing else:

- `dist/rigmatch-fit.mjs`
- `package.json`
- `README.md`
- `LICENSE`

Then publish:

```bash
npm login
npm publish --access public
```

`npm login` opens the browser to sign in. If the account has two-factor sign-in on (it should), `npm publish` asks for a code.

## Checking it worked

From a fresh folder, not the repo, so npm fetches the published package:

```bash
npx rigmatch-fit@latest
```

It should print "RigMatch fit check", this PC's card, and the table. `npx rigmatch-fit@latest --version` should print the version in `cli/package.json` (`0.10.1` as of the 0.10.1 release; `0.10.0` if you published before it).

## Next releases

Bump `cli/package.json`'s version with the app's, then repeat the publishing steps. npm never accepts the same version twice, so a fix to the CLI between app releases needs its own patch version (for example `0.10.1`).
