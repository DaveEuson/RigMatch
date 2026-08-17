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

## The decision

**Windows:** accepted, no action. The code is not in the binary.

**Linux:** unreachable is a weaker guarantee than fixed. Before a public Linux
build, pick one:

1. **Patch it locally.** `[patch.crates-io]` glib 0.18.5 to a fork carrying the
   one-line `&p` -> `&mut p` change. The patch is tiny and well understood; the
   cost is owning a fork until gtk3-rs moves.
2. **Re-check upstream first.** If `gtk` has published past 0.18.2 with a
   glib 0.20 requirement, or Tauri's Linux backend has moved off gtk3-rs, the
   advisory clears with a plain dependency bump and no fork.

`npm run dist:linux` and `npm run pack:linux` run `scripts/check-linux-advisories.mjs`
first, which re-reads the lockfile and refuses to build quietly if this is still
unresolved. That check is the reminder; this file is the reasoning.
