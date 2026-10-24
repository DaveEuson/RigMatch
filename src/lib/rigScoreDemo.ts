// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The browser preview's stand-in for RigScore's runner.
 *
 * The preview has no Ollama and no graphics card, so it answers the way the
 * runner would on the sample PC (an RTX 3060 with llama3.2:3b installed), with
 * sample speeds and a stamp that names itself as the preview, so a sample can
 * never pass for a measurement.
 */
import type { RigProgress, RigRunReply, RigRunRequest } from './rigScoreRun.ts';

/** Sample writing and prompt speeds per model, roughly an RTX 3060's. */
const SAMPLE_SPEEDS: Record<string, { decode: number; prefill: number }> = {
  'llama3.2:3b': { decode: 96, prefill: 2600 },
  'qwen3:8b': { decode: 47, prefill: 1250 },
  'qwen3:14b': { decode: 27, prefill: 700 },
};

export function createRigScoreDemo(installed: () => string[], vramGb: number) {
  const listeners = new Set<(update: RigProgress) => void>();
  const canceled = new Set<string>();
  const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const emit = (update: RigProgress) => listeners.forEach((listener) => listener(update));

  return {
    async runRigScore(request: RigRunRequest): Promise<RigRunReply> {
      const machine = { gpu: 'Sample graphics card (browser preview)', vramGb, appVersion: 'preview' };
      emit({ id: request.progressId, phase: 'checking' });
      await wait(250);
      if (vramGb < request.minVramGb) return { status: 'too-big', machine };
      if (!installed().includes(request.model)) return { status: 'not-installed' };
      const speeds = SAMPLE_SPEEDS[request.model] ?? { decode: 20, prefill: 500 };
      emit({ id: request.progressId, phase: 'loading' });
      await wait(500);
      const runs = [];
      for (let run = 1; run <= request.measuredRuns; run += 1) {
        if (canceled.delete(request.progressId)) return { status: 'stopped' };
        emit({ id: request.progressId, phase: 'run', run, of: request.measuredRuns });
        await wait(450);
        const wobble = 1 + (run - 2) * 0.01;
        runs.push({
          promptEvalCount: 1486,
          promptEvalSeconds: 1486 / (speeds.prefill * wobble),
          evalCount: request.options.num_predict,
          evalSeconds: request.options.num_predict / (speeds.decode * wobble),
          loadSeconds: 0.05,
        });
      }
      return {
        status: 'done',
        runs,
        coldLoadSeconds: 1.8,
        gpuShare: 1,
        ollamaVersion: 'preview',
        quantization: 'Q4_K_M',
        machine,
      };
    },
    async cancelRigScore(progressId: string) {
      canceled.add(progressId);
    },
    onRigScoreProgress(callback: (update: RigProgress) => void) {
      listeners.add(callback);
      return () => { listeners.delete(callback); };
    },
  };
}
