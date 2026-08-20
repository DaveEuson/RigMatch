import { agentArcadeApi } from '../api';
import robotRomanceHero from '../assets/robot-romance-hero.webp';
import { getMatchNotes } from '../lib/datingProfile';
import { getResponseEstimate, getScoreTone, getScoreTooltip, gradeFor } from '../lib/format';
import type { RigPick } from '../lib/modelCatalog';
import { getModelProfile, getModelScore, getShortModelName } from '../lib/modelCatalog';
import type { BenchmarkResult, ModelRow, NetworkHost, SystemProfile, TestedModelScore } from '../types';
import { AgentDatingProfile } from './AgentDatingProfile';
import { AvatarBust, MachineAvatar } from './Avatars';
import { ResultExplanationCard } from './ResultExplanationCard';
import { ScoreTile } from './ScoreVisuals';
import { ShareScorecard } from './ShareScorecard';
import { ModelDemoChips } from './SkillDemoViewers';
import { Bot, MessageSquare, RefreshCw, Share2, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { companionLaunchMessage } from '../lib/companionLaunch';

export function AgentReveal({
  active,
  agentName,
  model,
  benchmark,
  selectedScore,
  modelScores,
  host,
  system,
  rows,
  selectedModel,
  onSelect,
  onTalk,
  onChoose,
  onRunTest,
  onEditQuestions,
  onTalkWithPrompt,
  topPick,
  onClearTopMatch,
  onClearScore,
  onRestoreClearedTopMatches,
  clearedTopMatchCount,
  onExportForHatch,
}: {
  active: boolean;
  agentName: string;
  model: string;
  benchmark: BenchmarkResult | null;
  selectedScore?: TestedModelScore;
  modelScores: Record<string, TestedModelScore>;
  host?: NetworkHost;
  system: SystemProfile;
  rows: ModelRow[];
  selectedModel: string;
  onSelect: (model: string) => void;
  onTalk: () => void;
  onChoose: () => void;
  onRunTest: () => void;
  onEditQuestions: () => void;
  onTalkWithPrompt: (prompt: string) => void;
  topPick?: RigPick | null;
  onClearTopMatch: () => void;
  onClearScore: (model: string) => void;
  onRestoreClearedTopMatches: () => void;
  clearedTopMatchCount: number;
  onExportForHatch: () => void;
}) {
  const activeProfile = getModelProfile(model);
  const matchNotes = getMatchNotes(activeProfile, selectedScore, host);
  const [dismissedModels, setDismissedModels] = useState<Set<string>>(new Set());
  const [shareOpen, setShareOpen] = useState(false);

  const dismissRosterModel = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedModels((prev) => new Set([...prev, name]));
  }, []);

  // Top 6 by score; unscored sort to the bottom; currently-viewed model always visible
  const validRows = rows.filter(Boolean);
  const selectedRow = validRows.find((r) => r.displayName === selectedModel || r.id === selectedModel);
  const sortedByScore = [...validRows].sort((a, b) => {
    const sA = getModelScore(a, modelScores)?.total ?? -1;
    const sB = getModelScore(b, modelScores)?.total ?? -1;
    return sB - sA;
  });
  const topModel = sortedByScore[0]?.displayName;
  const isTopPick = Boolean(selectedScore && model === topModel);
  const isCurrentTopMatch = Boolean(topPick?.row.displayName === model);
  const top6 = sortedByScore.filter((r) => !dismissedModels.has(r.displayName) || r.displayName === selectedModel || r.id === selectedModel).slice(0, 6);
  const inStrip = top6.some((r) => r.displayName === selectedModel || r.id === selectedModel);
  if (!inStrip && top6.length > 0) {
    const selRow = validRows.find((r) => r.displayName === selectedModel || r.id === selectedModel);
    if (selRow) top6[Math.min(5, top6.length - 1)] = selRow;
  }
  const rosterRows = top6;

  return (
    <section className={active ? 'panel agent-panel panel-focused' : 'panel agent-panel'}>
      <div className="agent-heading">
        <Bot aria-hidden="true" />
        <h2>Top Pick</h2>
      </div>

      <div
        className="agent-romance-banner"
        style={{ backgroundImage: `url(${robotRomanceHero})` }}
        aria-label="Robot matchmaking artwork"
      >
        <div>
          <span>RigMatch personals</span>
          <strong>{host?.hostname ?? 'This computer'} wants one good local model</strong>
          <em>
            {selectedScore
              ? `${agentName} has ${selectedScore.grade} chemistry with this rig.`
              : 'Run a model test to crown your Top Match.'}
          </em>
        </div>
      </div>

      <div className={selectedScore ? 'top-pick-hero scored' : 'top-pick-hero'} aria-label="Top pick result">
        <div className="top-pick-hero-left">
          <AvatarBust model={model} size="large" extraClass={isTopPick ? 'is-top-pick' : undefined} />
          <span className="avatar-frame-name">{getShortModelName(model)}</span>
        </div>
        <div className="top-pick-hero-right">
          <span>{selectedScore ? `Compatibility result · ${selectedScore.grade}` : 'No saved test for this model'}</span>
          <strong style={{ color: 'var(--text-strong)', fontSize: '20px', lineHeight: 1.1 }}>{agentName}</strong>
          <em style={{ color: 'var(--text)', fontSize: '12px', fontStyle: 'normal' }}>
            {selectedScore ? `${selectedScore.total} Match · ${selectedScore.grade} · ${getResponseEstimate(selectedScore.speed)}` : 'Run a compatibility test to crown the winner.'}
          </em>
          {selectedScore && (
            <div className="top-pick-ribbon-actions" style={{ justifyContent: 'flex-start', marginTop: '6px' }}>
              <button type="button" className="pick-this-one-btn" onClick={onChoose} title="Set as your active model">
                🌹 Use This Model
              </button>
              <button type="button" className="test-again-btn" onClick={() => setShareOpen(true)} title="Share this result as an image">
                <Share2 aria-hidden="true" />
                Share
              </button>
              {isCurrentTopMatch && (
                <button type="button" className="test-again-btn" onClick={onClearTopMatch} title="Clear this Top Match without deleting its scorecard">
                  <X aria-hidden="true" />
                  Clear Top Match
                </button>
              )}
              <button type="button" className="test-again-btn" onClick={onRunTest}>
                <RefreshCw aria-hidden="true" />
                Test Again
              </button>
              <button
                type="button"
                className="test-again-btn remove-score-btn"
                onClick={() => onClearScore(model)}
                title="Remove this saved scorecard and transcript"
              >
                <Trash2 aria-hidden="true" />
                Remove Score
              </button>
            </div>
          )}
          <div className="top-pick-ribbon-actions" style={{ justifyContent: 'flex-start', marginTop: '8px' }}>
            <button
              type="button"
              className="test-again-btn"
              onClick={onExportForHatch}
              // The label says what it does; "Hatch" is a third-party app most
              // users have never heard of, so it belongs in the explanation
              // rather than on the button itself.
              title="Save a small JSON profile of this match. Companion apps that accept it — such as Hatch — can set their local model from it without you typing model names."
            >
              <Upload aria-hidden="true" />
              Export model profile
            </button>
          </div>
          {!isCurrentTopMatch && clearedTopMatchCount > 0 && (
            <button type="button" className="test-again-btn top-pick-restore-action" onClick={onRestoreClearedTopMatches}>
              <RefreshCw aria-hidden="true" />
              Restore cleared Top Matches
            </button>
          )}
          <ModelDemoChips model={model} label="Made by this model" />
        </div>
      </div>

      {shareOpen && selectedScore && (
        <ShareScorecard model={model} score={selectedScore} system={system} onClose={() => setShareOpen(false)} />
      )}

      <div className="character-roster" aria-label="Model shortlist">
        {rosterRows.map((row) => {
          const rowScore = row.displayName === selectedModel
            ? selectedScore ?? getModelScore(row, modelScores)
            : getModelScore(row, modelScores);
          const scoreLabel = rowScore ? `${rowScore.total} · ${rowScore.grade}` : 'Not tested';
          const title = rowScore
            ? `${row.displayName}: Match ${rowScore.total}, grade ${rowScore.grade}.`
            : `${row.displayName}: not tested yet.`;
          const isActive = row.displayName === selectedModel;

          return (
            <div
              key={row.displayName}
              className={isActive ? 'roster-card active' : 'roster-card'}
              title={title}
            >
              <button
                type="button"
                className="roster-remove-btn"
                onClick={(e) => dismissRosterModel(row.displayName, e)}
                title={`Remove ${row.displayName} from comparison`}
                aria-label={`Remove ${row.displayName}`}
              >
                <X aria-hidden="true" />
              </button>
              <button
                type="button"
                className="roster-select-btn"
                onClick={() => onSelect(row.displayName)}
                aria-label={`View ${row.displayName}`}
              >
                <AvatarBust generationKind={row.generationKind} model={row.displayName} size="tiny" />
                <span className="roster-name">{getShortModelName(row.displayName)}</span>
                <span className={rowScore ? `roster-score ${getScoreTone(rowScore.total)}` : 'roster-score empty'}>
                  {scoreLabel}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="match-tagline">
        <span>Matchmaker note</span>
        <strong>{host?.hostname ?? 'Local machine'} + {model}</strong>
      </div>

      <AgentDatingProfile
        model={model}
        profile={activeProfile}
        benchmark={benchmark}
        score={selectedScore}
        row={selectedRow}
        host={host}
        system={system}
        onTalk={onTalk}
        onEditQuestions={onEditQuestions}
        onTalkWithPrompt={onTalkWithPrompt}
      />

      <div className="match-hero">
        <div className="agent-nameplate">
          <strong>{agentName}</strong>
          <span>Ollama model</span>
          <span>{activeProfile.archetype}</span>
          <span>{host?.hostname ?? 'Local machine'}</span>
        </div>

        <div className="score-grid">
          <ScoreTile label="Answer Quality" value={selectedScore?.sobriety} grade={selectedScore ? gradeFor(selectedScore.sobriety) : undefined} tone="pink" />
          <ScoreTile label="Speed" value={selectedScore?.speed} grade={selectedScore ? gradeFor(selectedScore.speed) : undefined} tone="gold" />
          <ScoreTile label="Match" value={selectedScore?.total} grade={selectedScore?.grade} tone="green" />
        </div>

        <div className="score-glossary" aria-label="Score glossary">
          <span title={getScoreTooltip('Answer Quality')}>Quality</span>
          <span title={getScoreTooltip('Speed')}>Pace</span>
          <span title={getScoreTooltip('Match')}>Fit</span>
        </div>

        <ResultExplanationCard
          model={model}
          profile={activeProfile}
          score={selectedScore}
          host={host}
          benchmark={benchmark}
          system={system}
        />

        <button type="button" className="talk-button" onClick={async () => {
          const result = await agentArcadeApi.openChatApp();
          const problem = companionLaunchMessage(result);
          if (problem) alert(problem);
        }}>
          <MessageSquare aria-hidden="true" />
          Chat With Match
        </button>
      </div>

      <div
        className={selectedScore ? 'grade-track' : 'grade-track empty'}
        aria-label="Grade track"
        title={selectedScore ? 'D to S grade band for the match score.' : 'Run a test to place this model on the grade track.'}
      >
        <span>D</span>
        <span>C</span>
        <span>B</span>
        <span>A</span>
        <span>S</span>
        {selectedScore && <i style={{ left: `${Math.min(96, Math.max(6, selectedScore.total))}%` }} />}
      </div>

      <div className="pairing-link" aria-label="Selected setup and model match">
        <div>
          <MachineAvatar host={host} size="small" />
          <span>Computer</span>
          <strong>{host?.hostname ?? 'Local machine'}</strong>
        </div>
        <i aria-hidden="true" />
        <div>
          <AvatarBust model={model} size="small" />
          <span>Model Match</span>
          <strong>{agentName}</strong>
        </div>
      </div>

      <div className="matchmaker-notes" aria-label="Why this match">
        <div>
          <span>Why this match?</span>
          <strong>{matchNotes.summary}</strong>
        </div>
        <ul>
          {matchNotes.reasons.map((reason) => (
            <li key={reason.label}>
              <span>{reason.label}</span>
              <strong>{reason.value}</strong>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
