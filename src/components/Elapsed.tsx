// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useEffect, useState } from 'react';
import { formatVideoDuration } from '../lib/videoFit';

/** Time since `since`, on its own clock, so only this text re-renders every second. */
export function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <>{formatVideoDuration(Math.max(0, (now - since) / 1000))}</>;
}
