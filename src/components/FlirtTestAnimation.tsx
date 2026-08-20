// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { getShortModelName } from '../lib/modelCatalog';
import type { NetworkHost, PendingRunMode } from '../types';
import { AvatarBust, MachineAvatar } from './Avatars';

export function FlirtTestAnimation({
  model,
  host,
  mode,
  questionLabel,
}: {
  model: string;
  host?: NetworkHost;
  mode: PendingRunMode;
  questionLabel?: string;
}) {
  const modelName = getShortModelName(model);
  const computerLine = questionLabel
    ? `Question: ${questionLabel}`
    : mode === 'speed-date'
    ? 'Same questions, no favorites.'
    : 'Show me your best answer.';
  const modelLine = questionLabel
    ? 'Answering this prompt live.'
    : mode === 'speed-date'
    ? 'I love a fair contest.'
    : 'You had me at prompt.';

  return (
    <div className="flirt-link" aria-label={`${host?.hostname ?? 'Computer'} is testing ${model}`}>
      <div className="flirt-node computer">
        <MachineAvatar host={host} size="small" />
        <div className="flirt-bubble">
          <span>{host?.isLocal ? 'This Computer' : 'Computer'}</span>
          <strong>{computerLine}</strong>
        </div>
      </div>

      <div className="flirt-chemistry" aria-hidden="true">
        <span />
        <i />
        <b />
      </div>

      <div className="flirt-node model">
        <AvatarBust model={model} size="small" />
        <div className="flirt-bubble">
          <span>{modelName}</span>
          <strong>{modelLine}</strong>
        </div>
      </div>
    </div>
  );
}
