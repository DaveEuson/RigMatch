// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
// Generated from the redesign's interface icon set (design_handoff_rigmatch/icons/ui).
// Strokes use currentColor; fixed signal colors use the tokens. Edit the source
// set and regenerate rather than editing these strings by hand.

export const UI_ICON_NAMES = ["badge","bolt","chat","cpu","disk","download","err","gavel","gear","gpu","hearts","lab","lineup","memory","models","more","nodes","ok","palette","picture","play","plug","ram","search","send","sparkle","trophy","tv","vram","warn"] as const;
export type UiIconName = (typeof UI_ICON_NAMES)[number];

export const UI_ICON_ART: Record<UiIconName, { strokeWidth: number; body: string }> = {
  "badge": {
    "strokeWidth": 2.2,
    "body": "<circle cx=\"12\" cy=\"9.5\" r=\"6\"></circle><circle cx=\"12\" cy=\"9.5\" r=\"2.6\" style=\"fill:var(--accent)\" stroke=\"none\"></circle><path d=\"M8.5 14.5 7 21l5-2.5 5 2.5-1.5-6.5\"></path>"
  },
  "bolt": {
    "strokeWidth": 2.2,
    "body": "<path d=\"M13.5 2.5 5 13.5h6l-1.5 8 8.5-11h-6Z\" style=\"fill:var(--accent)\"></path>"
  },
  "chat": {
    "strokeWidth": 2.2,
    "body": "<path d=\"M5 3.5h14a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-7l-5 3.5V17.5H5a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3Z\"></path><circle cx=\"8\" cy=\"10.5\" r=\"1.3\" style=\"fill:var(--accent)\" stroke=\"none\"></circle><circle cx=\"12\" cy=\"10.5\" r=\"1.3\" style=\"fill:var(--accent)\" stroke=\"none\"></circle><circle cx=\"16\" cy=\"10.5\" r=\"1.3\" style=\"fill:var(--accent)\" stroke=\"none\"></circle>"
  },
  "cpu": {
    "strokeWidth": 2.2,
    "body": "<rect x=\"5.5\" y=\"5.5\" width=\"13\" height=\"13\" rx=\"3.5\"></rect><rect x=\"9\" y=\"9\" width=\"6\" height=\"6\" rx=\"1.8\" style=\"fill:var(--accent)\" stroke=\"none\"></rect><path d=\"M9 2.5v3M15 2.5v3M9 18.5v3M15 18.5v3M2.5 9h3M2.5 15h3M18.5 9h3M18.5 15h3\"></path>"
  },
  "disk": {
    "strokeWidth": 2.2,
    "body": "<rect x=\"3\" y=\"4.5\" width=\"18\" height=\"15\" rx=\"4\"></rect><circle cx=\"12\" cy=\"11\" r=\"3.6\"></circle><circle cx=\"12\" cy=\"11\" r=\"1\" style=\"fill:var(--accent)\" stroke=\"none\"></circle><path d=\"M7 16.5h4\"></path><circle cx=\"17\" cy=\"16.5\" r=\"1.2\" style=\"fill:var(--accent)\" stroke=\"none\"></circle>"
  },
  "download": {
    "strokeWidth": 2.2,
    "body": "<path d=\"M12 3.5v10\" style=\"stroke:var(--accent)\"></path><path d=\"M7.5 9.5 12 14l4.5-4.5\" style=\"stroke:var(--accent)\"></path><path d=\"M3.5 15v2.5a3 3 0 0 0 3 3h11a3 3 0 0 0 3-3V15\"></path>"
  },
  "err": {
    "strokeWidth": 2.2,
    "body": "<circle cx=\"12\" cy=\"12\" r=\"9\" style=\"fill:var(--red);stroke:var(--red)\"></circle><path d=\"M8.8 8.8l6.4 6.4M15.2 8.8l-6.4 6.4\" style=\"stroke:var(--bg)\" stroke-width=\"2.6\"></path>"
  },
  "gavel": {
    "strokeWidth": 2.2,
    "body": "<rect x=\"9\" y=\"2.8\" width=\"11\" height=\"6\" rx=\"2.5\" transform=\"rotate(40 14.5 5.8)\"></rect><path d=\"M11 10.5 4 17.5\" stroke-width=\"3\"></path><path d=\"M12 20.5h9\" style=\"stroke:var(--accent)\"></path>"
  },
  "gear": {
    "strokeWidth": 2.2,
    "body": "<circle cx=\"12\" cy=\"12\" r=\"5.5\"></circle><circle cx=\"12\" cy=\"12\" r=\"2\" style=\"fill:var(--accent)\" stroke=\"none\"></circle><path d=\"M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6\" stroke-width=\"3\"></path>"
  },
  "gpu": {
    "strokeWidth": 2.2,
    "body": "<rect x=\"2.5\" y=\"6.5\" width=\"19\" height=\"11\" rx=\"3.5\"></rect><circle cx=\"9\" cy=\"12\" r=\"3\"></circle><circle cx=\"9\" cy=\"12\" r=\"1.1\" style=\"fill:var(--accent)\" stroke=\"none\"></circle><path d=\"M15 10h3.5M15 14h3.5M5 17.5v3\"></path>"
  },
  "hearts": {
    "strokeWidth": 2.2,
    "body": "<path d=\"M8.5 18C4.5 15.2 3 12.8 3 10.7 3 9 4.3 7.7 6 7.7c1.1 0 2 .6 2.5 1.5.5-.9 1.4-1.5 2.5-1.5 1.7 0 3 1.3 3 3 0 2.1-1.5 4.5-5.5 7.3Z\"></path><path d=\"M15.5 20.5c-4-2.8-5.5-5.2-5.5-7.3 0-1.7 1.3-3 3-3 1.1 0 2 .6 2.5 1.5.5-.9 1.4-1.5 2.5-1.5 1.7 0 3 1.3 3 3 0 2.1-1.5 4.5-5.5 7.3Z\" style=\"fill:var(--accent);stroke:var(--accent)\"></path><path d=\"M14 4l.6 1.8M18 3.5l-.6 1.9M10.5 4.8l1 1.2\"></path>"
  },
  "lab": {
    "strokeWidth": 2.2,
    "body": "<path d=\"M9 3h6M10 3v5.5L4.6 18a2 2 0 0 0 1.7 3h11.4a2 2 0 0 0 1.7-3L14 8.5V3\"></path><path d=\"M7 14.5h10l1.7 3.3a1 1 0 0 1-.9 1.5H6.2a1 1 0 0 1-.9-1.5Z\" style=\"fill:var(--accent)\" stroke=\"none\"></path><circle cx=\"11\" cy=\"11.5\" r=\".9\" style=\"fill:var(--accent)\" stroke=\"none\"></circle>"
  },
  "lineup": {
    "strokeWidth": 2.2,
    "body": "<circle cx=\"9\" cy=\"8\" r=\"3.5\"></circle><path d=\"M2.5 20c.7-3.6 3.3-5.5 6.5-5.5s5.8 1.9 6.5 5.5\"></path><path d=\"M18.5 6v6M15.5 9h6\" style=\"stroke:var(--accent)\"></path>"
  },
  "memory": {
    "strokeWidth": 2.2,
    "body": "<path d=\"M6 3.5h12a1 1 0 0 1 1 1v16l-7-4-7 4v-16a1 1 0 0 1 1-1Z\"></path><path d=\"M12 13c-2.4-1.6-3.2-3-3.2-4.2 0-1 .8-1.8 1.7-1.8.7 0 1.2.3 1.5.9.3-.6.8-.9 1.5-.9.9 0 1.7.8 1.7 1.8 0 1.2-.8 2.6-3.2 4.2Z\" style=\"fill:var(--accent)\" stroke=\"none\"></path>"
  },
  "models": {
    "strokeWidth": 2.2,
    "body": "<rect x=\"3\" y=\"3\" width=\"7.5\" height=\"7.5\" rx=\"2.5\"></rect><rect x=\"13.5\" y=\"3\" width=\"7.5\" height=\"7.5\" rx=\"2.5\" style=\"fill:var(--accent);stroke:var(--accent)\"></rect><rect x=\"3\" y=\"13.5\" width=\"7.5\" height=\"7.5\" rx=\"2.5\"></rect><rect x=\"13.5\" y=\"13.5\" width=\"7.5\" height=\"7.5\" rx=\"2.5\"></rect>"
  },
  "more": {
    "strokeWidth": 2.2,
    "body": "<circle cx=\"5\" cy=\"12\" r=\"2\" fill=\"currentColor\" stroke=\"none\"></circle><circle cx=\"12\" cy=\"12\" r=\"2\" style=\"fill:var(--accent)\" stroke=\"none\"></circle><circle cx=\"19\" cy=\"12\" r=\"2\" fill=\"currentColor\" stroke=\"none\"></circle>"
  },
  "nodes": {
    "strokeWidth": 2.2,
    "body": "<rect x=\"2.5\" y=\"4\" width=\"7\" height=\"6\" rx=\"2\"></rect><rect x=\"14.5\" y=\"14\" width=\"7\" height=\"6\" rx=\"2\" style=\"fill:var(--accent);stroke:var(--accent)\"></rect><rect x=\"14.5\" y=\"4\" width=\"7\" height=\"6\" rx=\"2\"></rect><path d=\"M9.5 7h5M18 10v4M9.5 7c3 0 2 10 5 10\"></path>"
  },
  "ok": {
    "strokeWidth": 2.2,
    "body": "<circle cx=\"12\" cy=\"12\" r=\"9\" style=\"fill:var(--green);stroke:var(--green)\"></circle><path d=\"M7.5 12.3l3 3 6-6.3\" style=\"stroke:var(--bg)\" stroke-width=\"2.6\"></path>"
  },
  "palette": {
    "strokeWidth": 2.2,
    "body": "<path d=\"M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-1.9 0-1.3-1.1-1.7-1.1-2.8 0-1 .9-1.7 2-1.7h2.4A3.7 3.7 0 0 0 21 11c0-4.4-4-8-9-8Z\"></path><circle cx=\"7.5\" cy=\"10.5\" r=\"1.5\" style=\"fill:var(--accent)\" stroke=\"none\"></circle><circle cx=\"10.5\" cy=\"7\" r=\"1.5\" style=\"fill:var(--gold)\" stroke=\"none\"></circle><circle cx=\"15\" cy=\"7.5\" r=\"1.5\" fill=\"#4fb3a5\" stroke=\"none\"></circle>"
  },
  "picture": {
    "strokeWidth": 2.2,
    "body": "<rect x=\"2.5\" y=\"4\" width=\"19\" height=\"16\" rx=\"4\"></rect><circle cx=\"16\" cy=\"9\" r=\"2\" style=\"fill:var(--accent)\" stroke=\"none\"></circle><path d=\"M3 17.5l5.5-5.5 4 4 2.5-2.5 6 5\"></path>"
  },
  "play": {
    "strokeWidth": 2.2,
    "body": "<path d=\"M8 5.2v13.6a1.2 1.2 0 0 0 1.8 1l10.4-6.8a1.2 1.2 0 0 0 0-2L9.8 4.2A1.2 1.2 0 0 0 8 5.2Z\" style=\"fill:var(--accent)\"></path>"
  },
  "plug": {
    "strokeWidth": 2.2,
    "body": "<path d=\"M9 3v4M15 3v4\"></path><path d=\"M6.5 7h11v3.5a5.5 5.5 0 0 1-11 0Z\"></path><path d=\"M12 16v2.5a2.5 2.5 0 0 0 2.5 2.5H17\"></path><path d=\"M11 10.5l1.6-2v2.6L14 9\" style=\"stroke:var(--accent)\"></path>"
  },
  "ram": {
    "strokeWidth": 2.2,
    "body": "<rect x=\"2.5\" y=\"7\" width=\"19\" height=\"8.5\" rx=\"2.5\"></rect><rect x=\"5.5\" y=\"9.5\" width=\"3\" height=\"3.5\" rx=\"1\" style=\"fill:var(--accent)\" stroke=\"none\"></rect><rect x=\"10.5\" y=\"9.5\" width=\"3\" height=\"3.5\" rx=\"1\"></rect><rect x=\"15.5\" y=\"9.5\" width=\"3\" height=\"3.5\" rx=\"1\"></rect><path d=\"M6 15.5v3M10 15.5v3M14 15.5v3M18 15.5v3\"></path>"
  },
  "search": {
    "strokeWidth": 2.2,
    "body": "<circle cx=\"10.5\" cy=\"10.5\" r=\"6.5\"></circle><path d=\"M15.5 15.5 21 21\" stroke-width=\"3\"></path><path d=\"M8 8.5a3 3 0 0 1 3-1.5\" style=\"stroke:var(--accent)\"></path>"
  },
  "send": {
    "strokeWidth": 2.2,
    "body": "<path d=\"M21 3 3 10.5l7 2.5 2.5 7Z\" style=\"fill:var(--accent)\"></path><path d=\"M21 3 10 13\"></path>"
  },
  "sparkle": {
    "strokeWidth": 2.2,
    "body": "<path d=\"M10 3c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5C7.4 8.9 9.4 6.9 10 3Z\" style=\"fill:var(--accent);stroke:var(--accent)\"></path><path d=\"M18 14.5c.3 1.9 1.1 2.7 3 3-1.9.3-2.7 1.1-3 3-.3-1.9-1.1-2.7-3-3 1.9-.3 2.7-1.1 3-3Z\"></path>"
  },
  "trophy": {
    "strokeWidth": 2.2,
    "body": "<path d=\"M7 3.5h10v5a5 5 0 0 1-10 0Z\"></path><path d=\"M7 5.5H4.5v1.5A3 3 0 0 0 7.5 10M17 5.5h2.5v1.5a3 3 0 0 1-3 3\"></path><path d=\"M12 13.5v3M8 20.5h8M9 16.5h6v4H9z\"></path><path d=\"M12 5.2l.8 1.6 1.7.2-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7L9.5 7l1.7-.2Z\" style=\"fill:var(--accent)\" stroke=\"none\"></path>"
  },
  "tv": {
    "strokeWidth": 2.2,
    "body": "<rect x=\"2.5\" y=\"6.5\" width=\"19\" height=\"13\" rx=\"4\"></rect><rect x=\"5.5\" y=\"9.5\" width=\"10\" height=\"7\" rx=\"2\"></rect><circle cx=\"18.5\" cy=\"11\" r=\"1.1\" style=\"fill:var(--accent)\" stroke=\"none\"></circle><circle cx=\"18.5\" cy=\"15\" r=\"1.1\" style=\"fill:var(--accent)\" stroke=\"none\"></circle><path d=\"M8.5 6.5 6 3M15.5 6.5 18 3\"></path>"
  },
  "vram": {
    "strokeWidth": 2.2,
    "body": "<path d=\"M3.5 16a8.5 8.5 0 0 1 17 0\"></path><path d=\"M12 16l4-5\" style=\"stroke:var(--accent)\"></path><circle cx=\"12\" cy=\"16\" r=\"2\" style=\"fill:var(--accent)\" stroke=\"none\"></circle><path d=\"M6 16h.01M18 16h.01M7.8 10.2h.01M16.2 10.2h.01M12 8h.01\" stroke-width=\"2.8\"></path>"
  },
  "warn": {
    "strokeWidth": 2.2,
    "body": "<path d=\"M10.3 4.2a2 2 0 0 1 3.4 0l7.6 13a2 2 0 0 1-1.7 3H4.4a2 2 0 0 1-1.7-3Z\" style=\"fill:var(--gold);stroke:var(--gold)\"></path><path d=\"M12 9v4.5\" style=\"stroke:var(--bg)\" stroke-width=\"2.6\"></path><circle cx=\"12\" cy=\"16.8\" r=\"1.3\" style=\"fill:var(--bg)\" stroke=\"none\"></circle>"
  }
};
