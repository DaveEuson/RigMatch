// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { Trophy } from 'lucide-react';
import { comparisonGroups } from '../lib/channelWinners';
import type { AdvancedLabResult } from '../lib/labResults';
import type { LineupRecord } from '../lib/videoLineup';
import type { ComparedChannel, Workbench } from '../lib/workbench';
import { BalanceFader } from './BalanceFader';
import { ComparisonRunCard, type ComparisonRunContext } from './ComparisonRunCard';
import { LabComparison } from './LabComparison';
import { VideoLineupResults } from './VideoLineupResults';

const COPY: Record<ComparedChannel, { title: string; subtitle: string; empty: string; emptyBody: string }> = {
  images: {
    title: 'Pictures side by side',
    subtitle: 'Every checkpoint given the same prompt, ranked by what matters to you.',
    empty: 'Nothing to compare yet',
    emptyBody: 'Tick two or more picture models above and draw the same prompt with each, and their pictures line up here.',
  },
  video: {
    title: 'Clips side by side',
    subtitle: 'The last lineup: one prompt, one seed, ranked by what matters to you.',
    empty: 'No race yet',
    emptyBody: 'Tick two or more video models above and race them on one prompt, and their clips line up here.',
  },
  listening: {
    title: 'Transcripts side by side',
    subtitle: 'Each model’s latest listening test, ranked by what matters to you.',
    empty: 'Nothing to compare yet',
    emptyBody: 'Run the Listening test on two or more models that can hear, and their transcripts line up here.',
  },
};

/**
 * The Comparison screen for a channel Speed Dating cannot test.
 *
 * Speed Dating asks questions, and an image, video or transcription model does
 * not answer questions: it makes something. So on those channels Comparison
 * puts what each model made side by side, and the fader ranks them. Pictures
 * and video can be run from here too, several models on one prompt; listening
 * is still tested in the Lab, and its empty state says so.
 */
export function ChannelComparisonPanel({
  workbench,
  labResults,
  lineup,
  balance,
  onBalanceChange,
  lockedReason = null,
  onOpenLab,
  run,
}: {
  workbench: Workbench & { id: ComparedChannel };
  labResults: Record<string, AdvancedLabResult>;
  /** The lineup in flight or the last one, from the lineup session. */
  lineup: {
    record: LineupRecord | null;
    running: boolean;
    current: { key: string; name: string; startedAt: number } | null;
  };
  balance: number;
  onBalanceChange: (value: number) => void;
  lockedReason?: string | null;
  onOpenLab: () => void;
  /** What running several picture or video models on one prompt needs. */
  run?: ComparisonRunContext;
}) {
  const channel = workbench.id;
  const copy = COPY[channel];
  const rankAt = lockedReason ? 0 : balance;
  const record = lineup.record;
  const hasResults = channel === 'video'
    ? Boolean(record && (record.entries.length > 0 || lineup.running))
    : comparisonGroups(Object.values(labResults), channel).length > 0;
  const finished = new Set(record?.entries.map((entry) => entry.key));
  const unfinished = record
    ? record.planned.filter((item) => !finished.has(item.key) && item.key !== lineup.current?.key)
    : [];

  return (
    <section className="panel panel-focused channel-comparison" aria-label={`Comparison: ${workbench.label}`}>
      <div className="speed-date-title">
        <div>
          <span>Comparison · {workbench.label}</span>
          <strong>{copy.title}</strong>
        </div>
        <em>{copy.subtitle}</em>
      </div>

      <div className="channel-comparison-body">
        <BalanceFader
          value={balance}
          onChange={onBalanceChange}
          accuracyMeans={workbench.accuracyMeans}
          lockedReason={lockedReason}
          label={`What matters more for ${workbench.activity}?`}
        />

        {run && channel !== 'listening' && (
          // Keyed so switching between Images and Video starts from a clean pick.
          <ComparisonRunCard key={channel} channel={channel} context={run} balance={rankAt} />
        )}

        {!hasResults ? (
          <div className="speed-date-empty">
            <Trophy aria-hidden="true" />
            <strong>{copy.empty}</strong>
            <span>{copy.emptyBody}</span>
            {(!run || channel === 'listening') && (
              <button type="button" className="primary-button compact" onClick={onOpenLab}>
                {workbench.startLabel}
              </button>
            )}
          </div>
        ) : channel === 'video' && record ? (
          <VideoLineupResults
            record={record}
            saved={labResults}
            rankAt={rankAt}
            running={lineup.running}
            current={lineup.current}
            unfinished={unfinished}
          />
        ) : channel !== 'video' ? (
          <LabComparison channel={channel} results={labResults} balance={rankAt} />
        ) : null}
      </div>
    </section>
  );
}
