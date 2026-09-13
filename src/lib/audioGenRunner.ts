// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The half of the audio test that needs the Electron bridge, kept apart so the
 * decisions in audioGenChallenge and the runs in audioLineup stay testable.
 */

import { agentArcadeApi } from '../api.ts';
import type { ListenFn } from './audioGenRun.ts';

/**
 * Ask a local model that can hear one yes/no question about a clip.
 *
 * The listening test's request, cut down to a word. Audio rides the images
 * array and is only understood through /api/chat, and thinking is off: a
 * thinking model spends a small budget thinking and then answers nothing.
 */
export function createOllamaListener(model: string, baseUrl: string): ListenFn {
  return async (wavBase64, question) => {
    const data = await agentArcadeApi.runAdvancedGenerate({
      model,
      baseUrl,
      prompt: question,
      images: [wavBase64],
      chat: true,
      think: false,
      keep_alive: '10m',
      timeoutMs: 120000,
      options: { temperature: 0, num_ctx: 4096, num_predict: 24 },
    });
    if (data.error) throw new Error(data.error);
    return data.response ?? '';
  };
}
