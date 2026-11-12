# Publishing rigmatch-fit to npm

`rigmatch-fit` (the `cli/` folder) is published to npm under Dave's account, once per app release, after the release is out. Its version follows the app's: the release bump sets `"version"` in `cli/package.json` along with the others.

## Before the first publish on a PC

- **Two-factor sign-in has to be on for the npm account.** Without it, `npm publish` stops with `403 Forbidden ... Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages`. Turn it on at npmjs.com under Account → Two-Factor Authentication, then publish.
- **Keep two security keys on the account, and the recovery codes somewhere you'll find them.** npm's two-factor sign-in asks for a security key, and a passkey counts: one saved in Windows (it shows under Windows Settings → Accounts → Passkeys) and one on your phone. With only one and it lost, the way back in is a recovery code, and **using a recovery code puts a 72-hour hold on the account**: no publishing, no tokens, no settings changes. That happened on 2026-11-11.
- `npm login` opens the browser to sign in. It is needed once per PC, and again whenever `npm whoami` says you're signed out or fails with `401 Unauthorized` (the sign-in saved in `C:\Users\davee\.npmrc` has expired).

## Publishing, after the release is out

Publish from the release tag, not from `main`: `main` may already hold work for the next release, and the npm package should be exactly the code the release was built from.

Run these in PowerShell, one at a time, with the tag of the release you just published (`v0.11.2-beta` below).

If `C:\Users\davee\rigmatch-publish` is still there from last time, delete it first, or the clone stops with "already exists":

```bash
Remove-Item -Recurse -Force C:\Users\davee\rigmatch-publish
```

```bash
git clone --branch v0.11.2-beta --depth 1 https://github.com/DaveEuson/RigMatch.git C:\Users\davee\rigmatch-publish
```

```bash
cd C:\Users\davee\rigmatch-publish
```

```bash
npm ci
```

```bash
cd C:\Users\davee\rigmatch-publish\cli
```

```bash
npm pack --dry-run
```

If it lists `rigmatch-ai` and hundreds of files, you're in the top folder instead of `cli`. Nothing is wrong (that package is private, so npm won't publish it); run the `cd` above again.

`npm pack --dry-run` builds the CLI first (the `prepack` script runs `npm run build:cli` and copies the repo's `LICENSE` into `cli/`). Check two things in what it prints:

- `version` is the release's version.
- The file list has these four, and nothing else:
  - `dist/rigmatch-fit.mjs`
  - `package.json`
  - `README.md`
  - `LICENSE`

Then publish:

```bash
npm whoami
```

```bash
npm publish --access public
```

If `npm whoami` says you aren't signed in, run `npm login` first. `npm publish` then prints "Authenticate your account at:" and a link. Press Enter, approve it in the browser, and the publish finishes with `+ rigmatch-fit@<version>`.

## Checking it worked

Wait two minutes first. npm prints "Your package is being processed", and for about 90 seconds it serves a placeholder version (`0.0.0-stage`). `npx` run against the placeholder fails with "could not determine executable". The package is fine; just try again.

Then, from a folder outside the repo, so npm fetches the published package:

```bash
cd $HOME
```

```bash
npx --yes rigmatch-fit@latest --version
```

It should print the version you just published.

```bash
npx --yes rigmatch-fit@latest
```

It should print "RigMatch fit check", this PC's card, and the table.

Afterwards, delete `C:\Users\davee\rigmatch-publish`. It is only a copy of the release, and the build left a `LICENSE` file in `cli/`.

## Between releases

npm never accepts the same version twice. A fix to the CLI between app releases needs its own patch version (for example `0.11.1`), which means a release of its own: bump, tag, then publish from that tag as above.
