// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { MIN_CONTESTANTS } from '../lib/downloadStatus';
import { countWithVerb, formatGb } from '../lib/format';
import { getModelScore } from '../lib/modelCatalog';
import { formatMatchScore } from '../lib/scoring';
import type { ModelRow, TestedModelScore } from '../types';
import { AvatarBust } from './Avatars';
import { ExternalLink, Plus, Trophy, X } from 'lucide-react';
import { useState } from 'react';

export function ModelPoolLineupStrip({
  className = '',
  rows,
  installedRows,
  modelScores,
  disabled,
  isListTesting,
  canRunSpeedDate,
  onRemove,
  onAdd,
  onRunListTest,
  onOpenSpeedDate,
}: {
  className?: string;
  rows: ModelRow[];
  installedRows: ModelRow[];
  modelScores: Record<string, TestedModelScore>;
  disabled: boolean;
  isListTesting: boolean;
  canRunSpeedDate: boolean;
  onRemove: (row: ModelRow) => void;
  onAdd: (row: ModelRow) => void;
  onRunListTest: () => void;
  onOpenSpeedDate: () => void;
}) {
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const slots = Array.from({ length: 5 }, (_item, index) => rows[index]);
  const full = rows.length >= 5;
  const missingDownloadCount = rows.filter((row) => !row.installed).length;
  const canUsePrimaryAction = rows.length >= MIN_CONTESTANTS && !disabled;
  const classNames = ['model-pool-lineup', full ? 'full' : '', className].filter(Boolean).join(' ');
  const startLabel = isListTesting
    ? 'Testing...'
    : rows.length < MIN_CONTESTANTS
      ? `Pick ${Math.max(0, MIN_CONTESTANTS - rows.length)} more`
      : missingDownloadCount > 0
        ? 'Open Setup'
        : 'Start Speed Dating';
  const lineupStatus = rows.length < MIN_CONTESTANTS
    ? `Pick at least ${MIN_CONTESTANTS} contestants before the show starts.`
    : missingDownloadCount > 0
      ? `${countWithVerb(missingDownloadCount, 'contestant', 'needs', 'need')} downloading. Open setup to download the selected lineup.`
      : full
        ? 'Lineup full. Remove a contestant to swap.'
        : 'Ready. Add more or start the show.';

  return (
    <section className={classNames} aria-label="Speed Dating lineup">
      <div className="model-pool-lineup-head">
        <div>
          <span>Dating Game Setup</span>
          <strong>{rows.length}/5 contestants picked</strong>
          <em>{lineupStatus}</em>
        </div>
        <div className="lineup-head-actions">
          <button
            type="button"
            className="primary-button compact"
            onClick={canRunSpeedDate ? onRunListTest : onOpenSpeedDate}
            disabled={!canUsePrimaryAction}
            title={missingDownloadCount > 0 ? 'Open Speed Dating setup to download the selected lineup' : undefined}
          >
            <Trophy aria-hidden="true" />
            {startLabel}
          </button>
          <button type="button" className="mini-button outline" onClick={onOpenSpeedDate} title="Open the full Speed Dating setup">
            <ExternalLink aria-hidden="true" />
            Open
          </button>
        </div>
      </div>
      <div className="model-pool-lineup-slots">
        {slots.map((row, index) => {
          if (!row) {
            const isPickerOpen = pickerSlot === index;
            return (
              <div key={`empty-${index}`} className="model-pool-empty-slot-wrapper">
                <button
                  type="button"
                  className={`model-pool-empty-slot interactive${isPickerOpen ? ' picker-open' : ''}`}
                  onClick={() => setPickerSlot(isPickerOpen ? null : index)}
                  disabled={disabled || full}
                  aria-label="Add contestant to Speed Dating lineup"
                  aria-expanded={isPickerOpen}
                >
                  <Plus aria-hidden="true" />
                  <strong>Add</strong>
                </button>
                {isPickerOpen && (
                  <>
                    <div
                      className="picker-backdrop"
                      role="presentation"
                      onClick={() => setPickerSlot(null)}
                    />
                    <div className="model-picker-popover" role="listbox" aria-label="Choose a model">
                      <div className="picker-header">
                        <span>Pick a model</span>
                      </div>
                      {installedRows.length === 0 ? (
                        <p className="picker-empty">No installed models left. Download one from the list below.</p>
                      ) : (
                        installedRows.slice(0, 8).map((candidate) => {
                          const score = getModelScore(candidate, modelScores);
                          return (
                            <button
                              key={candidate.displayName}
                              type="button"
                              role="option"
                              aria-selected={false}
                              className="picker-model-row"
                              onClick={() => { onAdd(candidate); setPickerSlot(null); }}
                            >
                              <AvatarBust model={candidate.displayName} size="tiny" />
                              <span className="picker-model-name">{candidate.displayName}</span>
                              <span className="picker-model-meta">
                                {score ? `${score.grade}` : formatGb(candidate.sizeGb ?? 0)}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          }

          const score = getModelScore(row, modelScores);
          return (
            <article key={row.displayName} className="model-pool-lineup-card">
              <AvatarBust generationKind={row.generationKind} model={row.displayName} size="tiny" />
              <div>
                <span>Contestant {index + 1}</span>
                <strong>{row.displayName}</strong>
                <em>{score ? `${formatMatchScore(score)} Match · ${score.grade}` : 'Not tested yet'}</em>
              </div>
              <button
                type="button"
                className="icon-action"
                onClick={() => onRemove(row)}
                disabled={disabled}
                title={`Remove ${row.displayName} from Speed Dating`}
                aria-label={`Remove ${row.displayName} from Speed Dating`}
              >
                <X aria-hidden="true" />
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
