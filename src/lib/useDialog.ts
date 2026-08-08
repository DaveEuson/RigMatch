import { useEffect, useRef } from 'react';

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
 *                 restored, Escape simply does nothing.
 */
export function useDialog<T extends HTMLElement = HTMLElement>(onClose?: () => void) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;

    // Remember where focus came from so it can go back. Without this, closing a
    // dialog drops focus to <body> and a keyboard user restarts from the top of
    // the page every time.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = () => Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    // Move focus in. Prefer the first real control; fall back to the panel so
    // screen readers announce the dialog rather than leaving the user behind it.
    const first = focusable()[0];
    if (first) {
      first.focus();
    } else {
      panel.setAttribute('tabindex', '-1');
      panel.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) {
        event.stopPropagation();
        onClose();
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

    // Capture phase: a dialog rendered inside a component that also listens for
    // Escape would otherwise see both handlers fire.
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Only restore if focus is still somewhere in the dialog. If the app moved
      // focus deliberately on close, do not yank it back.
      if (previouslyFocused && (!document.activeElement || panel.contains(document.activeElement) || document.activeElement === document.body)) {
        previouslyFocused.focus?.();
      }
    };
  }, [onClose]);

  return ref;
}
