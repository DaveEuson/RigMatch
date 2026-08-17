/**
 * The words Simple Mode puts in its stepper and footer.
 *
 * Pure copy logic, kept out of the component so it can be tested. That matters
 * most for the failure wording: the browser demo always completes its show, so
 * the text shown when a run DIES has no other way to be verified — and that is
 * exactly the text that was wrong. The footer used to insist "The show is still
 * running" over a frozen screen that offered no way back.
 */

export type StepId = 'setup' | 'pick' | 'download' | 'compare' | 'winner';

export const STEPS: StepId[] = ['setup', 'pick', 'download', 'compare', 'winner'];

export const STEP_LABELS: Record<StepId, string> = {
  setup: 'Setup',
  pick: 'Pick',
  download: 'Download',
  compare: 'Compare',
  winner: 'Winner',
};

export function footerHint(step: StepId, ready: boolean, pickCount: number): string {
  switch (step) {
    // Only claim readiness once the check has actually passed. Before that this
    // line congratulated the user for a scan that hadn't run — and once it has,
    // the Setup screen already says so, so the footer stays quiet either way.
    case 'setup': return ready ? '' : 'One click checks Ollama and your hardware — nothing is installed or changed';
    case 'download': return 'Heads up: the show works your GPU, CPU, and fans hard until a winner is crowned — close heavy apps first';
    case 'compare': return 'Scores appear live — the winner is crowned after the last round';
    case 'winner': return 'RigMatch remembers your Top Match — find it any time in the header';
    default: return pickCount ? '' : 'Pick at least 1 to continue';
  }
}

export function nextBlockedHint(step: StepId, downloadReason?: string, runFailed = false): string {
  switch (step) {
    case 'setup': return 'Check your computer first';
    case 'pick': return 'Pick at least 1 to continue';
    // "Waiting for downloads to finish" was shown even when every download had
    // already stopped and one had failed, which was simply untrue.
    case 'download': return downloadReason || 'Waiting for downloads to finish';
    // Likewise: a run that died is not a run that is still going. Saying so
    // stranded beginners on a frozen Compare screen with a disabled Next.
    case 'compare': return runFailed
      ? 'The show stopped early — go Back to try again'
      : 'The show is still running';
    default: return '';
  }
}

/**
 * Why the Listening Test cannot start.
 *
 * The button was disabled on four separate conditions and named none of them,
 * so a dead primary control sat on the panel with no way to work out what it
 * wanted. Four states, four sentences — the same rule the wizard footer
 * follows.
 */
export function listeningBlockedReason(state: {
  hasModel: boolean;
  providerReady: boolean;
  running: boolean;
  needsCapture: boolean;
  hasCapture: boolean;
}): string {
  if (state.running) return '';
  if (!state.hasModel) return 'Pick a model that can hear first';
  if (!state.providerReady) return 'Start Ollama first';
  if (state.needsCapture && !state.hasCapture) return 'Record or upload audio first';
  return '';
}
