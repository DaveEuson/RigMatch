// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The app's one RigScore session, for App and the Speed score screen alike.
 *
 * It lived inside the screen's lazily loaded module, so App could not see a
 * speed test running: a show, a Labs test or a request from RigMatch Chat
 * could start beside it and share the graphics card. App imports this, and
 * counts a running speed test as the card being busy.
 */
import { useSyncExternalStore } from 'react';
import { agentArcadeApi } from '../api';
import { createRigSession, rigScoreBusy, type RigSessionState } from './rigScoreSession.ts';

export const rigScoreSession = createRigSession(agentArcadeApi);
export { rigScoreBusy };

/** What a show or test started during a speed test or a context check says instead of starting. */
export const RIG_SCORE_BUSY = 'The speed test or context check on My PC is using the graphics card. This can start when it finishes, or stop it there.';

export function useRigScoreSession(): RigSessionState {
  return useSyncExternalStore(rigScoreSession.subscribe, rigScoreSession.getState);
}
