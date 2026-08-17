import { getScoreTone } from '../lib/format';
import type { ModelProfile } from '../lib/modelCatalog';
import { getResultExplanation } from '../lib/modelCatalog';
import type { BenchmarkResult, NetworkHost, SystemProfile, TestedModelScore } from '../types';
import { AlertTriangle } from 'lucide-react';

export function ResultExplanationCard({
  model,
  profile,
  score,
  host,
  benchmark,
  system,
}: {
  model: string;
  profile: ModelProfile;
  score?: TestedModelScore;
  host?: NetworkHost;
  benchmark?: BenchmarkResult | null;
  system?: SystemProfile;
}) {
  const explanation = getResultExplanation(model, profile, score, host, benchmark, system);

  return (
    <div className={`result-explainer ${score ? getScoreTone(score.total) : 'empty'}`}>
      <span>{score ? 'Judge Card' : 'Judge Card Pending'}</span>
      <strong>{explanation.title}</strong>
      <p>{explanation.body}</p>
      {explanation.bottleneck && (
        <p className="result-explainer-bottleneck">
          <AlertTriangle aria-hidden="true" />
          {explanation.bottleneck}
        </p>
      )}
    </div>
  );
}
