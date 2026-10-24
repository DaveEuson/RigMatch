// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Make everything beside a cover unreachable while it is up.
 *
 * The live show covers the screen, and a blind show's pick and reveal cover
 * the window, but covering is only paint. The screens underneath stayed in
 * the Tab order and the accessibility tree: mid-show, Results could be
 * opened from the top bar and tabbed through under the stage, names, scores
 * and "Clear score" buttons included. `inert` takes them out of both, and
 * aria-hidden says so to readers that predate it.
 *
 * Siblings that mount later (the screen the top bar switches to) are sealed
 * as they arrive. Only what this sealed is released, and an aria-hidden that
 * was there before is put back as it was.
 *
 * Plain DOM, no React: callers run it from an effect.
 */

/** The slice of the DOM this touches, so it can be checked without a browser. */
export type SealableElement = {
  parentElement: { children: ArrayLike<SealableElement> } | null;
  hasAttribute(name: string): boolean;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
};

/** Seal `cover`'s siblings; returns the release. */
export function sealSiblings(cover: SealableElement): () => void {
  const parent = cover.parentElement;
  if (!parent) return () => undefined;
  // Each sealed sibling, with the aria-hidden it had before (null for none).
  const sealed = new Map<SealableElement, string | null>();
  const seal = () => {
    for (const child of Array.from(parent.children)) {
      // Already inert means someone else owns it; leave it to them.
      if (child === cover || sealed.has(child) || child.hasAttribute('inert')) continue;
      sealed.set(child, child.getAttribute('aria-hidden'));
      child.setAttribute('inert', '');
      child.setAttribute('aria-hidden', 'true');
    }
  };
  seal();
  const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(seal);
  observer?.observe(parent as unknown as Node, { childList: true });
  return () => {
    observer?.disconnect();
    for (const [child, ariaHidden] of sealed) {
      child.removeAttribute('inert');
      if (ariaHidden === null) child.removeAttribute('aria-hidden');
      else child.setAttribute('aria-hidden', ariaHidden);
    }
  };
}
