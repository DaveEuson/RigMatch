/// <reference types="vite/client" />

import type { AgentArcadeApi } from './types';

declare global {
  interface Window {
    agentArcade?: AgentArcadeApi;
  }
}
