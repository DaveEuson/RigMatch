// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { formatGb, getResponseEstimate } from '../lib/format';
import { getHardwareFit, getModelProfile } from '../lib/modelCatalog';
import { formatMatchScore } from '../lib/scoring';
import type { ModelRow, TestedModelScore } from '../types';
import { AvatarBust } from './Avatars';
import { X } from 'lucide-react';

export function SpeedDateContestantCard({
  row,
  index,
  score,
  vramGb,
  disabled,
  onRemove,
}: {
  row: ModelRow;
  index: number;
  score?: TestedModelScore;
  vramGb: number;
  disabled: boolean;
  onRemove: (row: ModelRow) => void;
}) {
  const profile = getModelProfile(row.displayName);
  const hardwareFit = getHardwareFit(row, vramGb);
  const sizeLabel = row.sizeGb ? formatGb(row.sizeGb) : 'Size unknown';

  return (
    <article className="speed-date-contestant-card">
      <button
        type="button"
        className="speed-date-remove"
        onClick={() => onRemove(row)}
        disabled={disabled}
        title={`Remove ${row.displayName} from Speed Dating`}
        aria-label={`Remove ${row.displayName} from Speed Dating`}
      >
        <X aria-hidden="true" />
      </button>
      <div className="speed-date-contestant-head">
        <AvatarBust generationKind={row.generationKind} model={row.displayName} size="tiny" />
        <div>
          <span>Contestant {index + 1}</span>
          <strong>{row.displayName}</strong>
          <em>{profile.archetype}</em>
        </div>
      </div>
      <div className="speed-date-contestant-facts">
        <span>{score ? `${formatMatchScore(score)} Match · ${score.grade}` : 'Not tested yet'}</span>
        <span>{score ? getResponseEstimate(score.speed) : sizeLabel}</span>
        <span>{hardwareFit.label}</span>
      </div>
      <p>{profile.specialties.join(' · ')}</p>
    </article>
  );
}
