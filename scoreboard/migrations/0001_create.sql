-- RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
-- The scoreboard's tables. Applied with:
--   npx --yes wrangler@4.152.0 d1 migrations apply rigmatch-scoreboard --remote

-- One shared Speed score result: the rig stamp and the speeds, nothing that
-- names a person or a computer. The day it arrived is kept, not the time.
CREATE TABLE results (
  id TEXT PRIMARY KEY,
  received_on TEXT NOT NULL,
  tier TEXT NOT NULL,
  model TEXT NOT NULL,
  model_digest TEXT NOT NULL,
  quantization TEXT NOT NULL,
  workload_version INTEGER NOT NULL,
  num_ctx INTEGER NOT NULL,
  prefill_tps REAL NOT NULL,
  decode_tps REAL NOT NULL,
  load_seconds REAL NOT NULL,
  gpu_share REAL NOT NULL,
  gpu TEXT NOT NULL,
  vram_gb REAL,
  driver_version TEXT,
  ollama_version TEXT,
  app_version TEXT NOT NULL,
  -- Set to 1 by hand to take a junk result off the board without deleting it.
  hidden INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX results_board ON results (tier, workload_version, hidden);

-- Today's random value. Mixed with a sender's address and hashed, it counts
-- sends per address for the day without keeping the address. Deleted with
-- the counts once the day (UTC) is over.
CREATE TABLE day_salt (
  day TEXT PRIMARY KEY,
  salt TEXT NOT NULL
);

CREATE TABLE sends_today (
  key TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  count INTEGER NOT NULL
);
