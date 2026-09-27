// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.

/**
 * The marquee: 22 bulbs around the stage, positioned and animated by
 * `.live-show-marquee` in App.css. Advanced's live stage and Simple Mode's
 * compare and winner stages share this one, so the bulbs are the same show
 * wherever they appear. Decoration only — hidden from assistive technology.
 *
 * `dark` is the lights-down state for a show that stopped: the bulbs hold
 * still and dim rather than chase over a show that is no longer running.
 *
 * `framed` adds the left-hand column. Advanced's stage leaves that side open
 * for the host; Simple Mode's stages are centered, and with the column missing
 * they read as lopsided rather than as a frame.
 */
export function ShowMarquee({ dark = false, framed = false }: { dark?: boolean; framed?: boolean }) {
  return (
    <div className={dark ? 'live-show-marquee lights-down' : 'live-show-marquee'} aria-hidden="true">
      {Array.from({ length: framed ? 29 : 22 }).map((_item, index) => <i key={index} />)}
    </div>
  );
}
