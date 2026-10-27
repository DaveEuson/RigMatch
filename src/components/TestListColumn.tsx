// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { testWhen, type TestEntry } from '../lib/testList';

/**
 * Every test done on this computer, newest first, beside the Results screen.
 *
 * Results showed one model's scorecard and nothing said there were other tests
 * to open. Choosing a row opens that test's results in place of the screen and
 * runs nothing; the first row goes back to the overview.
 *
 * Wide windows keep the column in view. Narrow ones keep it behind the Tests
 * button and slide it over the screen, because a squeezed screen beside it is
 * worse than a list one click away.
 */
export function TestListColumn({
  entries,
  selectedId,
  open,
  onSelect,
  onOverview,
  onClose,
}: {
  entries: TestEntry[];
  selectedId: string | null;
  /** Narrow windows only: whether the column is slid over the screen. */
  open: boolean;
  onSelect: (id: string) => void;
  onOverview: () => void;
  onClose: () => void;
}) {
  // The drawer is dismissed with Escape, as the dialogs are.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {open && <div className="test-list-scrim" onClick={onClose} aria-hidden="true" />}
      <aside className={open ? 'test-list open' : 'test-list'} id="test-list" aria-label="Every test">
        <header className="test-list-head">
          <h2>Tests</h2>
          <span>{entries.length === 0 ? 'None yet' : `${entries.length} on this computer`}</span>
          <button type="button" className="icon-action test-list-close" onClick={onClose} aria-label="Close the list of tests">
            <X aria-hidden="true" />
          </button>
        </header>
        <button
          type="button"
          className="test-list-row test-list-overview"
          aria-current={selectedId === null ? 'page' : undefined}
          onClick={onOverview}
        >
          <strong>Overview</strong>
          <span className="test-list-result">Top Match and scorecards</span>
        </button>
        {entries.length === 0 ? (
          <p className="test-list-empty">Each test you run will be listed here.</p>
        ) : (
          <ol className="test-list-rows">
            {entries.map((entry) => {
              const models = entry.models.filter(Boolean).join(', ');
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="test-list-row"
                    aria-current={entry.id === selectedId ? 'page' : undefined}
                    onClick={() => onSelect(entry.id)}
                  >
                    <strong>{entry.what}</strong>
                    <span className="test-list-models" title={models ? `${testWhen(entry.at)} · ${models}` : undefined}>
                      <time dateTime={entry.at || undefined}>{testWhen(entry.at)}</time>
                      {models && ` · ${models}`}
                    </span>
                    <span className="test-list-result">
                      {entry.headline}
                      {!entry.hasAnswers && ' · scores only'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </aside>
    </>
  );
}
