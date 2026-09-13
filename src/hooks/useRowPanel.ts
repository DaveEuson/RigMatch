// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useEffect, useRef, useState, type CSSProperties } from 'react';

/** The table cell's own padding, left and right. */
const CELL_PADDING = 16;

export type RowPanelSize = 'wide' | 'medium' | 'narrow';

/**
 * A test opened under its own row on the Models screen.
 *
 * The table scrolls sideways on a narrow window, and a panel as wide as the
 * table put its result off screen. So the panel is held to the part of the
 * table that shows and laid out for that width rather than the table's, and
 * when it opens from a click lower down it is brought into view with focus in
 * it, so the keyboard lands where the eyes do.
 */
export function useRowPanel() {
  const ref = useRef<HTMLElement>(null);
  const [visibleWidth, setVisibleWidth] = useState<number | null>(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' });
    ref.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const table = ref.current?.closest('.table-wrap');
    if (!table || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => setVisibleWidth(table.clientWidth));
    observer.observe(table);
    return () => observer.disconnect();
  }, []);

  const width = visibleWidth ? Math.max(0, visibleWidth - CELL_PADDING) : null;
  const size: RowPanelSize = width === null || width > 900 ? 'wide' : width > 560 ? 'medium' : 'narrow';
  const style: CSSProperties | undefined = width ? { width } : undefined;
  return { ref, size, style };
}
