# Advisory: glib `VariantStrIter` unsoundness (dependabot #2)

**Status: accepted for Windows. Must be re-decided before any public Linux build.**

Recorded 2026-08-17, against `rigmatch-chat/src-tauri/Cargo.lock` with glib 0.18.5
and Tauri 2.11.3.

## What the advisory says

`VariantStrIter::impl_get` — used by the `Iterator` and `DoubleEndedIterator`
impls for that type — passes an immutable `&p` to a C function that writes
through it as an out-parameter. Recent Rust compilers discard those writes under
optimisation, so `CStr::from_ptr` then receives NULL and dereferences it.

Affected: glib `>= 0.15.0, < 0.20.0`. Fixed in 0.20.0.

The bug is real and present in our locked version. In
`glib-0.18.5/src/variant_iter.rs`, `impl_get` reads:

```rust
let p: *mut libc::c_char = std::ptr::null_mut();
ffi::g_variant_get_child(
    self.variant.to_glib_none().0,
    i,
    s as *const u8 as *const _,
    &p,                       // <- must be &mut p
    std::ptr::null::<i8>(),
);
let p = std::ffi::CStr::from_ptr(p);
```

The impact is a crash (NULL dereference), not memory corruption an attacker
steers. It is a denial of service in the process that hits it.

## Why it does not affect the Windows build

glib enters the graph only through the GTK stack — `atk`, `cairo-rs`, `gdk`,
`gdk-pixbuf`, `gdkx11`, `gio`, `gtk`, `javascriptcore-rs`, `libappindicator`,
`pango`, `soup3`, `webkit2gtk`. All of those are Linux-only. Windows Tauri
renders through WebView2.

Verified rather than assumed:

```
cargo tree -e normal --target x86_64-pc-windows-msvc -i glib
  -> warning: nothing to print.

cargo tree -e normal --target x86_64-unknown-linux-gnu -i glib
  -> glib v0.18.5
     +-- atk v0.18.2
         +-- gtk v0.18.2
             +-- muda v0.19.3 -> tauri v2.11.3 -> rigmatch-chat
```

The `rigmatch-chat.exe` shipped inside the Windows installer contains no glib
code at all.

## Why it cannot simply be upgraded

- glib latest: 0.22.8 (0.20.0+ carries the fix)
- Tauri latest: 2.11.5 — we are on 2.11.3, a patch release apart
- **`gtk` (gtk3-rs) latest: 0.18.2, last published December 2024**

`gtk` 0.18.2 requires glib `^0.18`, and Tauri v2's Linux path runs on
webkit2gtk, which is GTK3. There is therefore no combination of published
versions that reaches glib 0.20 while keeping Tauri v2 on Linux. Dependabot's
"cannot update to a non-vulnerable version" is accurate, not a limitation of its
resolver.

## Why it is currently unreachable even on Linux

`VariantStrIter` has exactly one public constructor: `Variant::array_iter_str()`
(`glib-0.18.5/src/variant.rs:843`). Nothing outside glib itself calls it —
checked across every crate source in the resolved tree. GTK's own C internals
cannot reach it either; it is Rust-side sugar for iterating a GVariant string
array, and no code in this dependency graph asks for one.

(Two greps that look like hits are substrings, not calls: `to_writer_strict` in
`bitflags`, `custom_writer_struct` in `tracing-subscriber`.)

So on Linux today the vulnerable function is present but never invoked.

## Re-checked 2026-08-21, before the first tested Linux build

Option 2 — wait for upstream — is now closed rather than merely unlikely.

```
cargo search gtk
  gtk = "0.18.2"   # UNMAINTAINED Rust bindings for the GTK+ 3 library (use gtk4 instead)
cargo search tauri
  tauri = "2.11.5" # we are on 2.11.3
```

`gtk` is not simply frozen at 0.18.2; it is now published carrying an
UNMAINTAINED notice pointing at gtk4. It requires glib `^0.18`, and Tauri v2's
Linux backend is webkit2gtk, which is GTK3. There is no dependency bump that
reaches glib 0.20 while Tauri v2 runs on Linux, and there will not be one — the
crate that pins it has stopped moving.

The reachability analysis above was re-verified against the current lockfile on
the same date: nothing outside glib itself calls `array_iter_str`, the only
public constructor of `VariantStrIter`. glib is still locked at 0.18.5.

So the choice is narrower than it looked. It is now between patching a fork of
an unmaintained crate, and accepting a documented, re-verified unreachability —
not between fixing it and waiting.

Worth weighing against option 1: a `[patch.crates-io]` fork is itself a
supply-chain claim. It asks anyone auditing the build to trust a private fork of
glib in place of the published crate, to fix a function that is never called.
That is not obviously the safer of the two.

## What changed in the build path

The guard was wired into `npm run dist:linux` and `pack:linux`, and the GitHub
release workflow calls `electron-builder` directly — so it never ran there. The
Linux artifacts on v0.6.0-beta were built without it. The workflow now runs
`check-linux-advisories.mjs` on Linux jobs, which means a Linux release will
fail until this decision is recorded here or `--force` is given deliberately.

## The decision

**Windows:** accepted, no action. The code is not in the binary.

**Linux: accepted, 2026-08-21.** Recorded in `docs/accepted-advisories.json`,
pinned to glib 0.18.5.

Three things decided it, in order of weight:

1. **The function is never called.** `VariantStrIter` has one public
   constructor, and nothing outside glib itself calls it — verified when this
   was written and re-verified against the current lockfile on the date above.
2. **There is nowhere to move to.** gtk3-rs is published UNMAINTAINED and pins
   glib `^0.18`; Tauri v2's Linux backend is GTK3. This will not resolve by
   waiting, so "unreachable for now" is the permanent state of affairs rather
   than a holding position.
3. **The fork would cost more than it buys.** A `[patch.crates-io]` fork asks
   anyone auditing this build to trust a private glib in place of the published
   crate, in order to fix a function nothing calls, whose worst case is a crash
   rather than a compromise. For an app whose case rests on being readable,
   that is a real cost paid against a theoretical one.

The acceptance is pinned to the version deliberately. If glib resolves to a
different affected version, the reachability analysis above no longer describes
what is being shipped, and the guard refuses again rather than treating the
question as settled. `--force` still exists and still mutes everything; it is
not how this was accepted.

### The options as they stood

Kept because the reasoning above is only meaningful against them:

1. **Patch it locally.** `[patch.crates-io]` glib 0.18.5 to a fork carrying the
   one-line `&p` -> `&mut p` change. The patch is tiny and well understood; the
   cost is owning a fork until gtk3-rs moves.
2. **Re-check upstream first.** If `gtk` has published past 0.18.2 with a
   glib 0.20 requirement, or Tauri's Linux backend has moved off gtk3-rs, the
   advisory clears with a plain dependency bump and no fork.

`npm run dist:linux` and `npm run pack:linux` run `scripts/check-linux-advisories.mjs`
first, which re-reads the lockfile and refuses to build quietly if this is still
unresolved. That check is the reminder; this file is the reasoning.
