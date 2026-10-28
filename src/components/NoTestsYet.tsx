// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { RigPick } from '../lib/modelCatalog';
import { getFriendlyModelName } from '../lib/modelCatalog';
import { formatGb } from '../lib/format';
import type { SystemProfile } from '../types';

/**
 * What Results says before anything has been tested.
 *
 * It opened on the best fit among the installed models, headed "Untested pick"
 * with a portrait and a headroom figure, which reads as a winner. Nothing has
 * won: no test has run. This says so, says where tests will be listed, and
 * offers the one next step.
 */
export function NoTestsYet({
  system,
  topPick,
  onTest,
  onOpenModels,
}: {
  system: SystemProfile;
  topPick: RigPick | null;
  onTest: (model: string) => void;
  onOpenModels: () => void;
}) {
  // A model on this computer can be tested now; anything else has to be downloaded first.
  const installed = topPick?.tone === 'installed' ? topPick.row : null;
  const name = installed ? getFriendlyModelName(installed.displayName) : '';
  const card = system.gpu.vramGb > 0 ? formatGb(system.gpu.vramGb) : 'this computer';
  return (
    <div className="top-match-card">
      <section className="no-tests" aria-label="No tests yet">
        <h2>No tests yet</h2>
        <p>Every test you run is listed under Tests, newest first. Open one to see how it went.</p>
        {installed ? (
          <>
            <p>{name} is on this computer and fits {card}. Test it to see how it runs here.</p>
            <button type="button" className="btn btn-gold" onClick={() => onTest(installed.displayName)}>
              Test {name}
            </button>
          </>
        ) : (
          <>
            <p>There is no model on this computer to test yet.</p>
            <button type="button" className="btn btn-gold" onClick={onOpenModels}>Get a model</button>
          </>
        )}
      </section>
    </div>
  );
}
