/// <reference types="vite/client" />

import type { AgentArcadeApi } from './types.ts';

declare global {
  interface Window {
    agentArcade?: AgentArcadeApi;
  }
}
