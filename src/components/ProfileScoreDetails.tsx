import { formatMs } from '../lib/format';
import type { ModelProfile } from '../lib/modelCatalog';
import { formatMatchScore, isLegacyScore } from '../lib/scoring';
import type { BenchmarkResult, TestedModelScore } from '../types';

export function ProfileScoreDetails({
  model,
  profile,
  benchmark,
  score,
  details,
}: {
  model: string;
  profile: ModelProfile;
  benchmark: BenchmarkResult | null;
  score?: TestedModelScore;
  details: Array<{ label: string; value: string }>;
}) {
  const bestPrompt = benchmark?.prompts
    ?.slice()
    .sort((left, right) => right.sobrietyScore - left.sobrietyScore)[0];
  const exactScores = benchmark?.scores;
  const scoreCards = [
    {
      label: 'Match',
      value: exactScores ? formatMatchScore(exactScores) : score ? formatMatchScore(score) : 'N/A',
      note: exactScores?.grade ?? score?.grade ?? 'Run a test',
    },
    {
      label: 'Answer Quality',
      value: exactScores ? `${exactScores.sobriety}%` : score ? `${score.sobriety}%` : 'N/A',
      note: '34% weight',
    },
    {
      label: 'Speed',
      value: exactScores ? `${exactScores.speed}%` : score ? `${score.speed}%` : 'N/A',
      note: '32% weight',
    },
    {
      label: 'Finish Rate',
      value: exactScores ? `${exactScores.stability}%` : 'N/A',
      note: '18% weight',
    },
    {
      label: 'Computer Fit',
      value: exactScores ? `${exactScores.fit}%` : score ? `${score.fit}%` : 'N/A',
      note: '16% weight',
    },
  ];

  return (
    <div
      id="profile-panel-scores"
      className="dating-profile-score-body"
      role="tabpanel"
      aria-labelledby="profile-tab-scores"
    >
      <div className="profile-scoreboard" aria-label={`${profile.agentName} scorecard`}>
        <div className="profile-scoreboard-title">
          <span>Judge Card</span>
          <strong>{model}</strong>
          <em>{score ? `RigMatch scored this model ${formatMatchScore(score)} with ${score.grade} chemistry.${isLegacyScore(score) ? ' Retest recommended for current scoring.' : ''}` : 'No scored compatibility test yet.'}</em>
        </div>
        <div className="profile-score-grid">
          {scoreCards.map((card) => (
            <div key={card.label}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <em>{card.note}</em>
            </div>
          ))}
        </div>
        <div className="profile-score-formula">
          <span>Scoring recipe</span>
          <strong>34% answer quality + 32% speed + 18% finish rate + 16% computer fit</strong>
          <em>{benchmark ? `${benchmark.prompts.length} question${benchmark.prompts.length === 1 ? '' : 's'} scored in this transcript.` : 'Run a test to save the full score recipe.'}</em>
        </div>
        {bestPrompt ? (
          <div className="profile-best-prompt">
            <span>Best answer quality</span>
            <strong>{bestPrompt.label} · {bestPrompt.sobrietyScore}</strong>
            <em>{bestPrompt.tokensPerSecond} tok/s · {formatMs(bestPrompt.elapsedMs)}</em>
          </div>
        ) : (
          <div className="profile-empty-note">
            <strong>No prompt proof yet</strong>
            <span>Use Test in Contestants or run Speed Dating to save prompt-level proof.</span>
          </div>
        )}
      </div>

      <aside className="profile-details-table" aria-label={`${profile.agentName} score details`}>
        <div className="profile-details-title">
          <span>Score Details</span>
          <strong>{profile.agentName}</strong>
        </div>
        <dl>
          {details.map((detail) => (
            <div key={detail.label}>
              <dt>{detail.label}</dt>
              <dd>{detail.value}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}
