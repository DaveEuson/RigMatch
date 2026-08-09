import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Focus management for a modal dialog.
 *
 * The app declared `aria-modal="true"` on twenty dialogs and implemented none of
 * what that promises. `document.activeElement` appeared nowhere in src/, no Tab
 * handler existed, and nothing was ever restored on close — so a screen-reader
 * or keyboard user could tab straight out of a "modal" into the page behind it
 * and act on controls the dialog was supposedly blocking. Two of them were
 * destructive confirms with no Escape and no backdrop click, so the only way out
 * was to hunt for the Cancel button by tabbing through the page underneath.
 *
 * Attach the returned ref to the dialog panel — the element carrying
 * role="dialog" — not to the backdrop. A backdrop is full-viewport, so trapping
 * against it traps nothing.
 *
 * @param onClose  Called on Escape. Omit for a dialog that must be answered
 *                 (a required choice, a legal gate) — focus is still trapped and
 *                 restored, Escape simply does nothing. Read at keypress time,
 *                 so passing `isBusy ? undefined : onCancel` disables Escape
 *                 mid-life without disturbing focus.
 */

/**
 * Open dialog panels, innermost last. Dialogs do nest: ChoiceCruiseModal renders
 * ShareScorecard as a sibling inside its own backdrop, so two instances of this
 * hook are live at once, each with a listener on `document`.
 *
 * That needs a stack rather than per-instance listeners, because listeners on
 * the same node all run regardless of `stopPropagation` — only
 * `stopImmediatePropagation` would stop a sibling, and that would just make
 * whichever dialog happened to mount first win. Escape therefore closed both
 * dialogs at once, and on Tab each handler saw focus sitting outside its own
 * panel and yanked it back, so the top dialog was pinned to its first control
 * and the rest of it could not be reached at all.
 *
 * Only the panel on top of the stack responds.
 */
const openDialogs: HTMLElement[] = [];

export function useDialog<T extends HTMLElement = HTMLElement>(onClose?: () => void) {
  // A callback ref, not an object ref, so the trap keys off the panel element
  // itself. Not every caller renders its panel unconditionally — UtilityPanel
  // calls this at the top of the component but attaches the ref only while
  // `scoreExplainerOpen` is true — so an effect reading `ref.current` once would
  // find null, bail, and never install anything. Keying on the node means the
  // trap arrives when the panel mounts and leaves when it unmounts, wherever in
  // the component the hook is called.
  const [panel, setPanel] = useState<T | null>(null);
  const panelRef = useCallback((node: T | null) => setPanel(node), []);

  // Held in a ref so the effect below does not depend on the callback's
  // identity. Every call site passes a freshly-created arrow
  // (`onClose={() => setFoo(null)}`), so depending on `onClose` re-ran the whole
  // effect on every parent render — restoring focus out of the dialog and then
  // moving it back to the first control. The app re-renders every 1.6s during a
  // run and once per streamed token while a build is live, so focus was being
  // torn away continuously, exactly when a dialog was most likely to be open.
  //
  // Read at keypress time, which is also what lets a caller pass
  // `isDeleting ? undefined : onCancel` to disable Escape mid-life.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!panel) return;

    // Remember where focus came from so it can go back. Without this, closing a
    // dialog drops focus to <body> and a keyboard user restarts from the top of
    // the page every time.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    openDialogs.push(panel);

    // `iframe` is in here so the App Builder and skill-demo previews can be
    // reached at all. Leaving it out did not merely skip it in the cycle: the
    // Tab handler below preventDefaults at the ends, so the frame became
    // unreachable by keyboard entirely and the generated app — the whole point
    // of those two dialogs — was mouse-only.
    const focusable = () => Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    // Always focusable as a fallback, not only when the panel happens to have no
    // controls: the focus backstop below needs somewhere that is guaranteed to
    // accept focus, and a `.focus()` that silently does nothing would leave the
    // caret outside the dialog with no second event to correct it. `-1` keeps it
    // out of the Tab cycle, and out of `focusable()`.
    panel.setAttribute('tabindex', '-1');

    // Move focus in. Prefer the first real control; fall back to the panel so
    // screen readers announce the dialog rather than leaving the user behind it.
    const first = focusable()[0];
    (first ?? panel).focus();

    // Topmost by document position rather than by the order effects happened to
    // run. React runs a child's effects before its parent's, so a dialog that
    // renders another one in the same commit would register inside-out and hand
    // the keyboard to the dialog underneath. All the modals share a z-index, so
    // whichever comes last in the document is the one drawn on top.
    const ownsKeyboard = () => {
      const live = openDialogs.filter((el) => el.isConnected);
      if (live.length === 0) return false;
      const top = live.reduce((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? b : a);
      return top === panel;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // A dialog underneath another one is inert: the top one owns the keyboard
      // until it closes.
      if (!ownsKeyboard()) return;

      if (event.key === 'Escape' && onCloseRef.current) {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusable();
      if (items.length === 0) {
        // Nothing to move between — keep focus on the panel rather than letting
        // Tab escape into the page behind.
        event.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;

      // Wrap at both ends. Also catches focus already outside the panel, which
      // happens when the dialog opens over a page that had focus elsewhere.
      if (event.shiftKey && (active === firstItem || !panel.contains(active))) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && (active === lastItem || !panel.contains(active))) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    // Keydown alone cannot hold the trap, because it only sees keys pressed in
    // this document. Once focus is inside the sandboxed preview iframe, its key
    // events belong to another browsing context and never reach us — so the Tab
    // that leaves the frame's last control is invisible here, and focus lands on
    // whatever follows the panel: the page behind the dialog.
    //
    // Watching where focus actually lands catches that, and every other route
    // out too — programmatic focus, a click that lands outside, anything a
    // future dialog does. Cheap, and it makes the trap a statement about focus
    // rather than about one key.
    const onFocusIn = (event: FocusEvent) => {
      if (!ownsKeyboard()) return;
      const target = event.target as Node | null;
      if (target && panel.contains(target)) return;
      const items = focusable();
      (items[0] ?? panel).focus();
    };

    // Capture phase: a dialog rendered inside a component that also listens for
    // Escape would otherwise see both handlers fire.
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocusIn, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocusIn, true);
      const index = openDialogs.lastIndexOf(panel);
      if (index !== -1) openDialogs.splice(index, 1);
      // Only restore if focus is still somewhere in the dialog. If the app moved
      // focus deliberately on close, do not yank it back.
      if (previouslyFocused && (!document.activeElement || panel.contains(document.activeElement) || document.activeElement === document.body)) {
        previouslyFocused.focus?.();
      }
    };
  }, [panel]);

  return panelRef;
}
