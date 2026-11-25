// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The Cloudflare Worker's entry: requests go to the scoreboard, and the daily
 * schedule (wrangler.toml) deletes yesterday's send counts even on a day
 * nobody sends anything.
 */
import { forgetOldSends, handleRequest, type Env } from './scoreboard.ts';

export default {
  fetch: (request: Request, env: Env) => handleRequest(request, env),
  scheduled: (_controller: unknown, env: Env) => forgetOldSends(env.DB),
};
