// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useId, type ReactNode } from 'react';
import type { AchievementId } from '../lib/achievements';

/**
 * The badges, drawn as enamel pins: each its own shape and metal, so a row of
 * them reads as a collection at a glance and a missing one is an empty socket
 * of the right shape. Geometry only, in a 32-unit box.
 *
 * The pin colors are artwork, like the contestant portraits, not theme
 * tokens: a badge earned in Stage Plum is the same badge in Avocado Green.
 */

type Pin = {
  shape: ReactNode;
  /** Highlight, face, rim. */
  light: string;
  face: string;
  rim: string;
  /** Anything drawn on the face, over the enamel. */
  detail?: ReactNode;
};

const star = (cx: number, cy: number, outer: number, inner: number, points: number) => Array.from({ length: points * 2 }, (_, i) => {
  const r = i % 2 === 0 ? outer : inner;
  const a = (Math.PI * i) / points - Math.PI / 2;
  return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
}).join(' ');

const gear = Array.from({ length: 32 }, (_, i) => {
  // Eight teeth: four points per tooth, alternating tip and root radius.
  const r = i % 4 < 2 ? 14 : 10.5;
  const a = (Math.PI * 2 * (i - 0.5)) / 32;
  return `${(16 + r * Math.cos(a)).toFixed(2)},${(16 + r * Math.sin(a)).toFixed(2)}`;
}).join(' ');

const PINS: Record<AchievementId, Pin> = {
  'first-date': {
    shape: <path d="M16 28.5 4.4 16.9A6.9 6.9 0 0 1 16 8.2a6.9 6.9 0 0 1 11.6 8.7Z" />,
    light: '#ffc0cc', face: '#e0607a', rim: '#6e1f30',
  },
  'speed-dater': {
    shape: <polygon points={star(16, 17, 14, 6.2, 5)} />,
    light: '#ffd9a8', face: '#ee8a3a', rim: '#6b3410',
  },
  'second-date': {
    shape: <><circle cx="11.5" cy="16" r="8.5" /><circle cx="20.5" cy="16" r="8.5" /></>,
    light: '#b0f2e6', face: '#3fb8a8', rim: '#13544c',
  },
  'fair-judge': {
    shape: <polygon points="16,2.5 27.7,9.25 27.7,22.75 16,29.5 4.3,22.75 4.3,9.25" />,
    light: '#ddd0ff', face: '#9677dd', rim: '#3e2a6e',
    detail: <path d="M10 13h12M16 10v12M10 13l-2 5h4zM22 13l-2 5h4z" fill="none" stroke="rgba(30,18,60,0.55)" strokeWidth="1.3" strokeLinejoin="round" />,
  },
  'hands-on': {
    shape: <polygon points={gear} />,
    light: '#f4f7fa', face: '#a7b4c1', rim: '#3c4652',
    detail: <circle cx="16" cy="16" r="4" fill="rgba(25,32,40,0.5)" />,
  },
  'thick-skin': {
    shape: <path d="M16 2.5 27.5 6.8V15c0 7-4.8 12-11.5 14.5C9.3 27 4.5 22 4.5 15V6.8Z" />,
    light: '#ffa597', face: '#d04a3c', rim: '#5c1a12',
    detail: <path d="M16 2.5V29.5" stroke="rgba(70,15,10,0.45)" strokeWidth="1.4" />,
  },
  'picture-this': {
    shape: <path d="M16 2.5 29.5 16 16 29.5 2.5 16Z" />,
    light: '#c0e6ff', face: '#47a6e6', rim: '#154b70',
  },
  'say-it': {
    shape: <path d="M3 23.5A13 13 0 0 1 29 23.5Z" />,
    light: '#e3f7b0', face: '#9bc84a', rim: '#3f5a12',
    detail: <path d="M9.5 23.5a6.5 6.5 0 0 1 13 0M13 23.5a3 3 0 0 1 6 0" fill="none" stroke="rgba(40,60,10,0.5)" strokeWidth="1.3" />,
  },
  penguin: {
    shape: <ellipse cx="16" cy="16.5" rx="10.5" ry="13" />,
    light: '#7a8090', face: '#2e323d', rim: '#0b0d12',
    detail: <><ellipse cx="16" cy="19.5" rx="6.2" ry="8.6" fill="#f4efe6" /><path d="M14.2 9.6h3.6L16 12Z" fill="#f2a33a" /></>,
  },
  'trojan-hero': {
    shape: <path d="M12.5 2.5h7v2.2l-1 1v2.6c4.3 1.2 7.5 5 7.5 10.2 0 5-3.6 9.2-6.6 11h-6.8c-3-1.8-6.6-6-6.6-11 0-5.2 3.2-9 7.5-10.2V5.7l-1-1Z" />,
    light: '#f4ab7e', face: '#cf6a3d', rim: '#2a140a',
    detail: <path d="M8.2 16.5h15.6v4.6H8.2z" fill="#1d120c" opacity="0.85" />,
  },
};

const HIDDEN_SOCKET = <circle cx="16" cy="16" r="13" />;

export function AchievementBadge({ id, earned, hidden, size = 30 }: {
  id: AchievementId;
  earned: boolean;
  /** A hidden badge not yet earned shows only a "?" socket. */
  hidden?: boolean;
  size?: number;
}) {
  const uid = useId().replace(/:/g, '');
  const pin = PINS[id];
  if (!earned) {
    const secret = hidden;
    return (
      <svg className="achievement-pin socket" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <g className="socket-shape">{secret ? HIDDEN_SOCKET : pin.shape}</g>
        {secret && <text x="16" y="21" textAnchor="middle" className="socket-mark">?</text>}
      </svg>
    );
  }
  return (
    <svg className="achievement-pin" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-enamel`} x1="0.2" y1="0" x2="0.75" y2="1">
          <stop offset="0" stopColor={pin.light} />
          <stop offset="0.5" stopColor={pin.face} />
          <stop offset="1" stopColor={pin.rim} stopOpacity="0.9" />
        </linearGradient>
        <clipPath id={`${uid}-clip`}>{pin.shape}</clipPath>
      </defs>
      {/* Rim, then enamel, then what is drawn on it, then one glint. */}
      <g fill={pin.rim} stroke={pin.rim} strokeWidth="2.4" strokeLinejoin="round">{pin.shape}</g>
      <g fill={`url(#${uid}-enamel)`}>{pin.shape}</g>
      <g clipPath={`url(#${uid}-clip)`}>
        {pin.detail}
        <ellipse cx="10.5" cy="8.5" rx="5" ry="2.6" fill="#fff" opacity="0.38" transform="rotate(-28 10.5 8.5)" />
      </g>
    </svg>
  );
}
