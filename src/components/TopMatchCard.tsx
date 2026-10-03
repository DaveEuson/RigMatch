// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { RefreshCw, Trophy, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SystemProfile } from '../types';
import { balanceLabel } from '../lib/balance';
import type { ChannelWinner } from '../lib/channelWinners';
import type { RigPick } from '../lib/modelCatalog';
import { formatGb, topPickPresentation } from '../lib/format';
import { strongestSkill } from '../lib/shareCopy';
import { workbenchById, type Workbench, type WorkbenchId } from '../lib/workbench';
import { BalanceFader } from './BalanceFader';
import { AvatarBust } from './Avatars';
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
        <section className={`top-deck-winner${topPick.score ? ' with-fader' : ''}`} aria-label="Current best model">
          <AvatarBust model={topPick.row.displayName} size="small" extraClass="top-deck-winner-avatar" />
          <div className="top-deck-winner-copy">
            {/* The label gets its own row.
                It used to share one flex row with the buttons under
                justify-content:space-between, and only the label could shrink.
                Measured: the actions wanted 221px inside a 218px row, so the
                label was allotted exactly 0 and rendered as "TOP...". */}
            <div className="top-deck-winner-head">
              <span>{channel.id === 'chat' && topPick.score ? channel.shortLabel : shown.label}</span>
              {/* What it is top *for*. getRigPick has always computed this
                  sentence as `reason` and nothing ever showed it: the pick is
                  the highest saved Match score among models that fit this
                  computer, which is a narrower claim than "best model" and the
                  one the badge was silently making. */}
              <em className="top-deck-winner-basis" title={topPick.reason}>
                {topPick.tone === 'scored' ? `best score that fits ${fits}`
                  : topPick.tone === 'installed' ? `fits ${fits} · not tested yet`
                    : `fits ${fits} · not downloaded`}
              </em>
            </div>
            <strong>{topPick.row.displayName}</strong>
            <em>
              {/* With what it was ranked at: the same model can win at one fader
                  position and not another, so a bare score overclaims. */}
              {topPick.score ? `${topPick.score.total} Match · ${topPick.score.grade} · ${rankedAt}` : topPick.fitLabel}
              {/* And what it is actually good at, when a run measured enough to
                  say. strongestSkill returns null unless a task group has three
                  graded answers behind it, so this stays quiet rather than
                  crowning a skill on one question. */}
              {topPick.score && strongestSkill(topPick.score) && (
                <span className="top-deck-winner-skill"> · strongest at {strongestSkill(topPick.score)!.purpose}</span>
              )}
            </em>
              <div className="top-deck-winner-actions">
                {shown.canUse && (
                  <button
                    type="button"
                    className="top-deck-use-model-btn"
                    onClick={() => onUseTopPick(topPick.row.displayName)}
                    title="Set this as your active model"
                  >
                    Use this model
                  </button>
                )}
                {shown.testLabel && (
                  <button
                    type="button"
                    className="top-deck-test-again-btn"
                    onClick={() => onTestAgain(topPick.row.displayName)}
                    title={`Run the compatibility test on ${topPick.row.displayName}${topPick.score ? ' again' : ''}`}
                  >
                    <RefreshCw aria-hidden="true" />
                    {shown.testLabel}
                  </button>
                )}
                <button
                  type="button"
                  className="top-deck-clear-btn"
                  onClick={onClearTopPick}
                  title={`Clear ${topPick.row.displayName} as Top Match for now`}
                  aria-label={`Clear ${topPick.row.displayName} as Top Match`}
                >
                  <X aria-hidden="true" />
                </button>
                {clearedTopPickCount > 0 && (
                  <button
                    type="button"
                    className="top-deck-restore-btn"
                    onClick={onRestoreClearedTopPicks}
                    title="Restore cleared Top Match candidates"
                  >
                    Restore
                  </button>
                )}
              </div>
          </div>
          {topPick.score && fader}
        </section>
        );
      })() : (
        <section className="top-deck-winner empty" aria-label="No winner yet">
          <Trophy aria-hidden="true" />
          <div>
            <span>{channel.id === 'chat' ? channel.shortLabel : 'Best Match'}</span>
            <strong>No tests yet</strong>
            <em>{clearedTopPickCount > 0 ? `${clearedTopPickCount} cleared. Restore when needed.` : 'Test a model to crown the winner.'}</em>
            {clearedTopPickCount > 0 && (
              <button
                type="button"
                className="top-deck-restore-btn"
                onClick={onRestoreClearedTopPicks}
              >
                Restore
              </button>
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
        <Trophy aria-hidden="true" />
        <div>
          <span>{channel.shortLabel}</span>
          <strong>Nothing crowned yet</strong>
          <em>{channel.emptyHint}</em>
          <button type="button" className="top-deck-see-btn" onClick={onOpen}>{channel.startLabel}</button>
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
