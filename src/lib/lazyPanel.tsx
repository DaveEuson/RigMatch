// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { Suspense, lazy, type ComponentType } from 'react';

/**
 * A screen loaded the first time it is shown, in its own loading boundary.
 *
 * Everything shipped as one 1.16 MB script, so the website's demo downloaded
 * and parsed Settings, Labs, the run history and both modes before showing
 * the one screen it opens on. Each panel built with this is its own chunk.
 * The boundary is per panel, so the first visit to Settings blanks only
 * Settings for the moment the chunk takes from disk, not the whole window.
 */
export function lazyPanel<P extends object>(load: () => Promise<ComponentType<P>>): ComponentType<P> {
  const Lazy = lazy(async () => ({ default: await load() }));
  function Panel(props: P) {
    return (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    );
  }
  return Panel;
}
