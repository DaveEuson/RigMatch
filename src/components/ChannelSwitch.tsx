// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useRef, type KeyboardEvent } from 'react';
import { WORKBENCHES, type WorkbenchId } from '../lib/workbench';

/**
 * "What are you testing?": the channel switch.
 *
 * A radio group, so it is one Tab stop and the arrow keys move between
 * channels, the way eight answers to one question should behave. The active
 * channel is the accent, never gold: gold is the verdict, and choosing what to
 * look at is not one.
 *
 * It sits above the panel rather than inside this header, because it filters
 * what the panel shows and because the header collapses. Folded away, it took
 * the channels with it.
 */
export function ChannelSwitch({ value, onChange, channels, label = 'What are you testing?' }: {
  value: WorkbenchId;
  onChange: (id: WorkbenchId) => void;
  /** Which channels to offer: Labs offers only the ones with a lab of their own. */
  channels?: WorkbenchId[];
  label?: string;
}) {
  const offered = channels ? WORKBENCHES.filter((workbench) => channels.includes(workbench.id)) : WORKBENCHES;
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = offered.length - 1;
    const targets: Partial<Record<string, number>> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowDown: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      ArrowUp: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    const target = targets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    onChange(offered[target].id);
    buttons.current[target]?.focus();
  };

  return (
    <div className="channel-switch" role="radiogroup" aria-labelledby="channel-switch-label">
      {/* Named for a screen reader; to the eye the tabs say it. */}
      <span id="channel-switch-label" className="sr-only">{label}</span>
      {offered.map((workbench, index) => {
        const active = workbench.id === value;
        return (
          <button
            key={workbench.id}
            ref={(node) => { buttons.current[index] = node; }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            className={active ? 'active' : undefined}
            onClick={() => onChange(workbench.id)}
            onKeyDown={(event) => move(event, index)}
            title={workbench.id === 'all'
              ? 'Every kind of test at once'
              : `Models, the Lab and the winner cover ${workbench.activity} only`}
          >
            {workbench.label}
          </button>
        );
      })}
    </div>
  );
}
