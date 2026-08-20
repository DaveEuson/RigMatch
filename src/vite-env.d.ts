// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/// <reference types="vite/client" />

import type { AgentArcadeApi } from './types.ts';

declare global {
  interface Window {
    agentArcade?: AgentArcadeApi;
  }
}
