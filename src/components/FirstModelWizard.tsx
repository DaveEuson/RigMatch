import type { FirstModelUseCase } from '../lib/firstModel';
import { USE_CASES, getFirstModelPicks } from '../lib/firstModel';
import { Download, X } from 'lucide-react';
import { useState } from 'react';

export function FirstModelWizard({ vramGb, onQueueModel }: { vramGb: number; onQueueModel: (modelId: string) => void }) {
  const [useCase, setUseCase] = useState<FirstModelUseCase | null>(null);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const picks = useCase ? getFirstModelPicks(useCase, vramGb) : [];

  return (
    <div className="first-model-wizard">
      <div className="fmw-header">
        <div className="fmw-title">
          <span>🎬 Start here</span>
          <strong>Yeah, a lot of models. Let's narrow it down.</strong>
          <em>Answer one question and we'll pick your first contestant.</em>
        </div>
        <button type="button" className="icon-action" onClick={() => setDismissed(true)} aria-label="Dismiss" title="Show me the full list instead">
          <X aria-hidden="true" />
        </button>
      </div>

      <div className="fmw-use-cases" role="group" aria-label="What do you mainly want to use AI for?">
        <p className="fmw-question">What do you mainly want to use AI for?</p>
        {USE_CASES.map((uc) => (
          <button
            key={uc.id}
            type="button"
            className={`fmw-use-case-btn${useCase === uc.id ? ' active' : ''}`}
            onClick={() => setUseCase(useCase === uc.id ? null : uc.id)}
            aria-pressed={useCase === uc.id}
          >
            <span className="fmw-emoji">{uc.emoji}</span>
            <span className="fmw-label">{uc.label}</span>
            <span className="fmw-desc">{uc.description}</span>
          </button>
        ))}
      </div>

      {useCase && picks.length > 0 && (
        <div className="fmw-picks">
          <p className="fmw-picks-label">
            Perfect picks for your rig{vramGb > 0 ? ` (${vramGb} GB VRAM)` : ''} →
          </p>
          {picks.map((pick, i) => (
            <div key={pick.id} className={`fmw-pick-card${i === 0 ? ' recommended' : ''}`}>
              {i === 0 && <span className="fmw-pick-badge">⭐ Best match</span>}
              <div className="fmw-pick-info">
                <strong>{pick.name}</strong>
                <em>{pick.size} · {pick.vramNote}</em>
                <p>{pick.why}</p>
              </div>
              <button
                type="button"
                className={i === 0 ? 'primary-button compact' : 'mini-button'}
                onClick={() => { onQueueModel(pick.id); setDismissed(true); }}
              >
                <Download aria-hidden="true" />
                {i === 0 ? 'Download & Queue' : 'Queue'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
