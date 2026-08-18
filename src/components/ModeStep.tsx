import type { UiMode } from '../lib/appConfig';
import { SlidersHorizontal, Sparkles } from 'lucide-react';

export function ModeStep({ onPick }: { onPick: (mode: UiMode) => void }) {
  return (
    <>
        <h2 className="mode-splash-title">How would you like to start?</h2>
        <p className="mode-splash-sub">You can switch anytime from the header.</p>
        <div className="mode-splash-options">
          <button type="button" className="mode-splash-option simple" onClick={() => onPick('beginner')}>
            <Sparkles aria-hidden="true" />
            <strong>Simple Mode</strong>
            <em>A guided path: check your PC, pick models, download what's missing, compare, and use the winner.</em>
            <span className="mode-splash-cta">Start guided setup</span>
          </button>
          <button type="button" className="mode-splash-option advanced" onClick={() => onPick('advanced')}>
            <SlidersHorizontal aria-hidden="true" />
            <strong>Advanced Mode</strong>
            <em>The full control room: every model, custom test suites, skill tests, diagnostics, and logs.</em>
            <span className="mode-splash-cta">Open the control room</span>
          </button>
        </div>
    </>
  );
}
