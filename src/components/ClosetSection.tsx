// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { formatMatchScore } from '../lib/scoring';
import type { ModelRow, TestedModelScore } from '../types';

export function ClosetSection({
  rows,
  modelScores,
  topModel,
  onDeleteModel,
}: {
  rows: ModelRow[];
  modelScores: Record<string, TestedModelScore>;
  topModel?: string;
  onDeleteModel: (row: ModelRow) => void;
}) {
  // The closet: what is on the shelf, how much room it takes, and whether it
  // ever earned its place. Sorted by size because that is the question that
  // brings someone here — the close-cleanup dialog once offered to clear
  // 38.5 GB in one click, and this is the calm version of that moment.
  // Who owns the file, when it is not Ollama. ComfyUI checkpoints are the
  // biggest things on disk and the reason someone opens this screen, so they
  // are still listed and still counted — they just cannot be deleted here.
  const evictedBy = (row: ModelRow): string | null => {
    if (row.runtime === 'comfyui') return 'In ComfyUI';
    if (row.localProvider === 'lm-studio') return 'In LM Studio';
    return null;
  };
  const entries = rows
    .map((row) => ({
      row,
      sizeGb: row.installedModel?.sizeGb ?? row.sizeGb ?? 0,
      score: modelScores[row.displayName],
    }))
    .sort((a, b) => b.sizeGb - a.sizeGb);
  const totalGb = entries.reduce((sum, entry) => sum + entry.sizeGb, 0);
  if (entries.length === 0) {
    return (
      <section className="closet-section" aria-label="Model storage">
        <div className="closet-head">
          <span>The Closet</span>
          <strong>No installed models yet</strong>
        </div>
      </section>
    );
  }
  return (
    <section className="closet-section" aria-label="Model storage">
      <div className="closet-head">
        <span>The Closet</span>
        <strong>{entries.length} model{entries.length === 1 ? '' : 's'} · {totalGb.toFixed(1)} GB on disk</strong>
        <em>
          Keep the winner; evict who never earned a callback. Deleting always asks first, and anything
          evicted can be downloaded again. Models owned by ComfyUI or LM Studio are listed for their disk
          size but have to be removed where they live.
        </em>
      </div>
      <ul className="closet-list">
        {entries.map(({ row, sizeGb, score }) => {
          const isWinner = topModel !== undefined && row.displayName === topModel;
          return (
            <li key={row.displayName} className={isWinner ? 'closet-winner' : ''}>
              <div className="closet-row-name">
                <strong>{row.displayName}</strong>
                <em>
                  {score
                    ? `${formatMatchScore(score)} · ${score.grade} — tested ${new Date(score.completedAt).toLocaleDateString()}`
                    : 'Never tested — taking up space on reputation alone'}
                </em>
              </div>
              <span className="closet-size">{sizeGb > 0 ? `${sizeGb.toFixed(1)} GB` : '—'}</span>
              {isWinner ? (
                <span className="closet-keep" title="Your current top match. Probably worth its shelf space.">WINNER</span>
              ) : evictedBy(row) ? (
                // A button that cannot do what it says is worse than no button.
                // Ollama is the only thing RigMatch can delete from; ComfyUI
                // checkpoints and LM Studio models are owned elsewhere, and
                // routing them through Ollama's delete API just 404s.
                <span className="closet-elsewhere" title={`RigMatch cannot delete this one. ${evictedBy(row)}`}>
                  {evictedBy(row)}
                </span>
              ) : (
                <button
                  type="button"
                  className="mini-button closet-evict"
                  onClick={() => onDeleteModel(row)}
                  title={`Delete ${row.displayName} from this computer (asks first)`}
                >
                  Evict
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
