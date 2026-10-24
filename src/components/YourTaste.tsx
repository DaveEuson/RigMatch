// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useEffect, useMemo, useRef, useState } from 'react';
import { BLIND_TASTE_EVENT, BLIND_TASTE_FOCUS_EVENT, readBlindTaste, rateTaste, takeTasteFocus } from '../lib/blindMode';

/**
 * The viewer's own ranking, built only from blind picks. Shown on Results next
 * to the judge's, and only once there is a pick to rank, so it never adds an
 * empty box for someone who has not tried blind mode.
 */
export function YourTaste() {
  const [taste, setTaste] = useState(readBlindTaste);
  useEffect(() => {
    const reread = () => setTaste(readBlindTaste());
    window.addEventListener(BLIND_TASTE_EVENT, reread);
    return () => window.removeEventListener(BLIND_TASTE_EVENT, reread);
  }, []);
  // The reveal's "See the results" lands here: the pick it just saved, in view
  // and focused. Asked for before Results mounts, or while it is up.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const show = () => {
      const heading = headingRef.current;
      if (!heading || !takeTasteFocus()) return;
      heading.scrollIntoView({ block: 'start' });
      heading.focus({ preventScroll: true });
    };
    show();
    window.addEventListener(BLIND_TASTE_FOCUS_EVENT, show);
    return () => window.removeEventListener(BLIND_TASTE_FOCUS_EVENT, show);
  }, []);
  const rows = useMemo(() => rateTaste(taste.picks), [taste]);
  if (rows.length === 0) return null;

  const shows = taste.picks.length;
  return (
    <>
      <h3 className="results-heading" ref={headingRef} tabIndex={-1}>Your taste</h3>
      <p className="your-taste-note">
        From your {shows} blind pick{shows === 1 ? '' : 's'}. Each pick beats every other model in that show; ratings start at 1000.
      </p>
      <ol className="utility-list your-taste-list" aria-label="Your taste: models ranked by your blind picks">
        {rows.map((row, index) => (
          <li key={row.model}>
            <b>{index + 1}</b>
            <div className="score-row-name">
              <span>{row.model}</span>
              <em>Picked in {row.wins} of {row.shows} blind show{row.shows === 1 ? '' : 's'}</em>
            </div>
            <strong className="score-row-grade" title="Elo rating from your picks">{row.rating}</strong>
          </li>
        ))}
      </ol>
    </>
  );
}
