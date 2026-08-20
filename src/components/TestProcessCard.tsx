// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { BenchmarkQuestionCount } from '../benchmarkSuite';
import type { PendingRunMode } from '../types';

export function TestProcessCard({ mode, questionCount }: { mode: PendingRunMode; questionCount: BenchmarkQuestionCount }) {
  const isSpeedDate = mode === 'speed-date';
  const scoreParts = [
    {
      label: 'Same Questions',
      value: `${questionCount}`,
      detail: isSpeedDate
        ? 'Every picked model answers this exact set.'
        : 'The selected model answers this exact set.',
    },
    {
      label: 'Answer Quality',
      value: '34%',
      detail: 'Follows instructions, handles traps, and gives usable answers.',
    },
    {
      label: 'Speed',
      value: '32%',
      detail: 'Uses tokens per second and response delay.',
    },
    {
      label: 'Finish Rate',
      value: '18%',
      detail: 'Rewards completed, non-empty answers.',
    },
    {
      label: 'Computer Fit',
      value: '16%',
      detail: 'Checks model size against VRAM, RAM, and local setup.',
    },
  ];

  return (
    <section className="test-process-card" aria-label={isSpeedDate ? 'Speed Dating scoring rules' : 'Model test scoring rules'}>
      <div className="test-process-head">
        <div>
          <span>{isSpeedDate ? 'Speed Dating Rules' : 'Model Test Rules'}</span>
          <strong>Same questions. Same computer. Fair match.</strong>
        </div>
        <em>{isSpeedDate ? 'Highest final Match score wins.' : 'The final Match score grades this model here.'}</em>
      </div>
      <div className="test-process-grid">
        {scoreParts.map((part) => (
          <div key={part.label}>
            <span>{part.label}</span>
            <strong>{part.value}</strong>
            <em>{part.detail}</em>
          </div>
        ))}
      </div>
    </section>
  );
}
