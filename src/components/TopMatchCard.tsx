// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { ReactNode } from 'react';
import type { SystemProfile } from '../types';
import { balanceLabel } from '../lib/balance';
import type { ChannelWinner } from '../lib/channelWinners';
import type { RigPick } from '../lib/modelCatalog';
import { formatGb, topPickPresentation } from '../lib/format';
import { strongestSkill } from '../lib/shareCopy';
import { matchMeasures } from '../lib/matchCard';
import { formatMatchScore } from '../lib/scoring';
import { getModelAvatarSrc } from '../lib/modelAvatars';
import { getFriendlyModelName } from '../lib/modelCatalog';
import { workbenchById, type Workbench, type WorkbenchId } from '../lib/workbench';
import { BalanceFader } from './BalanceFader';
import { CHANNEL_ICONS } from '../lib/channelIcons';

/**
 * The Top Match, or the channel's winner, with what you can do about it: use
 * it, test it again, clear it, or restore what was cleared, and the fader it
 * was ranked at.
 *
 * This was the right-hand card of the stats deck. The redesign's top bar keeps
 * only a chip that opens Results, so the card lives on Results now.
 */
export function TopMatchCard({
  system,
  topPick,
  onUseTopPick,
  onTestAgain,
  onClearTopPick,
  onRestoreClearedTopPicks,
  clearedTopPickCount,
  workbench,
  channelWinner,
  balance,
  onBalanceChange,
  balanceLocked = null,
  onOpenChannel,
}: {
  system: SystemProfile;
  topPick?: RigPick | null;
  onUseTopPick: (model: string) => void;
  onTestAgain: (model: string) => void;
  onClearTopPick: () => void;
  onRestoreClearedTopPicks: () => void;
  clearedTopPickCount: number;
  workbench: WorkbenchId;
  channelWinner: ChannelWinner | null;
  balance: number;
  onBalanceChange: (value: number) => void;
  balanceLocked?: string | null;
  onOpenChannel: () => void;
}) {
  const channel = workbenchById(workbench);
  const chatLike = channel.id === 'all' || channel.id === 'chat';
  const rankedAt = balanceLabel(balanceLocked ? 0 : balance);
  const fader = (
    <BalanceFader
      variant="mini"
      value={balance}
      onChange={onBalanceChange}
      accuracyMeans={channel.accuracyMeans}
      lockedReason={balanceLocked}
      label={`${channel.matchLabel}: accuracy or speed?`}
    />
  );
  return (
    <div className="top-match-card">
      {!chatLike ? (
        <ChannelWinnerCard
          channel={channel}
          winner={channelWinner}
          rankedAt={rankedAt}
          fader={fader}
          onUse={onUseTopPick}
          onOpen={onOpenChannel}
        />
      ) : topPick ? (() => {
        const shown = topPickPresentation(topPick.tone, topPick.score?.grade);
        const fits = system.gpu.vramGb > 0 ? formatGb(system.gpu.vramGb) : 'this computer';
        return (
        <section className="top-deck-winner hero" aria-label="Current best model">
          <img className="top-match-portrait" src={getModelAvatarSrc(topPick.row.displayName)} alt="" />
          <div className="top-deck-winner-copy">
            {/* What it is top for: the highest saved Match among models that fit
                this computer, a narrower claim than "best model". */}
            <p className="top-match-kicker" title={topPick.reason}>
              {channel.id === 'chat' && topPick.score ? channel.shortLabel : shown.label}
              {' · '}
              {topPick.tone === 'scored' ? `best score that fits ${fits}`
                : topPick.tone === 'installed' ? `fits ${fits}, not tested yet`
                  : `fits ${fits}, not downloaded`}
            </p>
            <div className="top-match-name">
              <h2>{getFriendlyModelName(topPick.row.displayName)}</h2>
              <code>{topPick.row.displayName}</code>
            </div>
            {topPick.score ? (
              <div className="top-match-score">
                {/* With what it was ranked at: the same model can win at one
                    fader position and not another. */}
                <b>{formatMatchScore(topPick.score)}</b>
                <span>Match Score · Grade {topPick.score.grade} · {rankedAt}</span>
              </div>
            ) : (
              <p className="top-match-line">{topPick.fitLabel}</p>
            )}
            {/* What it is good at, only when three graded answers say so. */}
            {topPick.score && strongestSkill(topPick.score) && (
              <p className="top-match-line">Strongest at {strongestSkill(topPick.score)!.purpose}.</p>
            )}
            {topPick.score && (
              <dl className="top-match-measures">
                {matchMeasures(topPick.score).map((measure) => (
                  <div key={measure.label}><dt>{measure.label}</dt><dd>{Math.round(measure.value)}</dd></div>
                ))}
              </dl>
            )}
          </div>
          <div className="top-deck-winner-actions">
            {shown.canUse && (
              <button
                type="button"
                className="btn btn-gold"
                onClick={() => onUseTopPick(topPick.row.displayName)}
                title="Set this as your active model"
              >
                Use this model
              </button>
            )}
            {shown.testLabel && (
              <button
                type="button"
                className="btn btn-line"
                onClick={() => onTestAgain(topPick.row.displayName)}
                title={`Run the compatibility test on ${topPick.row.displayName}${topPick.score ? ' again' : ''}`}
              >
                {shown.testLabel}
              </button>
            )}
            <span className="top-match-links">
              <button
                type="button"
                className="btn btn-link"
                onClick={onClearTopPick}
                title={`Clear ${topPick.row.displayName} as Top Match for now`}
              >
                Clear for now
              </button>
              {clearedTopPickCount > 0 && (
                <button type="button" className="btn btn-link" onClick={onRestoreClearedTopPicks} title="Restore cleared Top Match candidates">
                  Restore
                </button>
              )}
            </span>
          </div>
        </section>
        );
      })() : (
        <section className="top-deck-winner empty" aria-label="No winner yet">
          <div>
            <h2 className="top-match-empty">No Top Match yet</h2>
            <p className="top-match-line">{clearedTopPickCount > 0 ? `${clearedTopPickCount} cleared. Restore when needed.` : 'Test a model to crown one.'}</p>
            {clearedTopPickCount > 0 && (
              <button type="button" className="btn btn-link" onClick={onRestoreClearedTopPicks}>Restore</button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * The winner card for a channel with a measurement of its own.
 *
 * Chat and All keep the Top Match card; every other channel is crowned by its
 * own test, at its own fader, from results measured on this computer.
 */
function ChannelWinnerCard({
  channel,
  winner,
  rankedAt,
  fader,
  onUse,
  onOpen,
}: {
  channel: Workbench;
  winner: ChannelWinner | null;
  /** "balanced", "70% accuracy". */
  rankedAt: string;
  fader: ReactNode;
  onUse: (model: string) => void;
  onOpen: () => void;
}) {
  if (!winner) {
    return (
      <section className="top-deck-winner empty" aria-label={`${channel.matchLabel}: nothing crowned yet`}>
        <div>
          <h2 className="top-match-empty">{channel.shortLabel}: nothing crowned yet</h2>
          <p className="top-match-line">{channel.emptyHint}</p>
          <button type="button" className="btn btn-line btn-sm" onClick={onOpen}>{channel.startLabel}</button>
        </div>
      </section>
    );
  }
  const Icon = CHANNEL_ICONS[channel.id];
  return (
    <section className="top-deck-winner with-fader channel" aria-label={channel.matchLabel}>
      <Icon aria-hidden="true" />
      <div className="top-deck-winner-copy">
        {/* The short label on its own: with "measured on this PC" beside it the
            card had room for neither, and the detail line below already says
            what was measured. */}
        <div className="top-deck-winner-head">
          <span title={`${channel.matchLabel}, measured on this PC`}>{channel.shortLabel}</span>
        </div>
        <strong title={winner.model}>{winner.model}</strong>
        <em>{winner.detail} · {winner.speedOnly ? 'speed only' : rankedAt}</em>
        <div className="top-deck-winner-actions">
          {winner.usable && (
            <button
              type="button"
              className="top-deck-use-model-btn"
              onClick={() => onUse(winner.model)}
              title="Set this as your active model"
            >
              Use this model
            </button>
          )}
          <button type="button" className="top-deck-see-btn" onClick={onOpen}>See results</button>
        </div>
      </div>
      {fader}
    </section>
  );
}
