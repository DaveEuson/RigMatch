import { useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Image as ImageIcon, Maximize2, Play, RefreshCw, Sparkles, X } from 'lucide-react';
import type { SkillRunStatus } from '../types';
import { getModelDemoArtifacts, type DemoArtifact } from '../lib/labResults';
import { buildSandboxedPreviewHtml } from '../lib/labPreview';
import { getShortModelName } from '../lib/modelCatalog';
import { AvatarBust } from './Avatars';

/**
 * Ambient indicator that a skill test is running, visible on any tab so you
 * don't have to sit on the Activity screen. Shown whenever the live view is
 * minimized or absent.
 */
export function SkillRunMiniBar({ status, canShowLive, onShow, onStop }: {
  status: SkillRunStatus;
  canShowLive: boolean;
  onShow: () => void;
  onStop: () => void;
}) {
  const stepLabel = status.total > 0 ? `${Math.min(status.completed + 1, status.total)}/${status.total}` : '';
  return (
    <aside className="live-mini-bar skill-run-mini-bar" role="status" aria-live="polite" aria-label="Skill test running">
      <span className="live-mini-dot" aria-hidden="true" />
      <div className="live-mini-info">
        <strong>Skill test running{stepLabel ? ` · ${stepLabel}` : ''}</strong>
        <em>{status.label}</em>
      </div>
      <button type="button" className="mini-button" onClick={onShow} title={canShowLive ? 'Watch it live' : 'Open the Activity monitor'}>
        <Maximize2 aria-hidden="true" />
        {canShowLive ? 'Watch' : 'Activity'}
      </button>
      <button type="button" className="live-show-stop compact" onClick={onStop} title="Stop after the current test finishes">
        <X aria-hidden="true" />
        Stop
      </button>
    </aside>
  );
}

/**
 * Live "watch it build" view: shows the model's reasoning and code streaming in
 * real time while an App Builder skill test runs, before the finished app is
 * rendered in DemoResultModal.
 */
export function LiveBuildModal({ build, onClose }: { build: { model: string; kind: 'app' | 'image' | 'vision'; text: string; done: boolean; error?: string }; onClose: () => void }) {
  const scrollRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [build.text]);
  const kindLabel = build.kind === 'app' ? 'App Builder' : build.kind === 'vision' ? 'Image Reading' : 'Image Lab';
  const activeVerb = build.kind === 'app' ? 'building' : build.kind === 'vision' ? 'reading the image' : 'generating the image';
  const doneVerb = build.kind === 'image' ? 'Finished — opening the image…' : build.kind === 'vision' ? 'Finished — opening the reading…' : 'Finished — opening the app…';
  const heading = build.error ? 'Skill test failed' : build.done ? doneVerb : `Watching it — ${activeVerb}…`;
  const streamable = build.kind !== 'image'; // image generation has no token stream
  const metaText = build.kind === 'app'
    ? 'reasoning and code stream in as the model writes them'
    : build.kind === 'vision'
      ? 'the model describes the picture in real time'
      : 'image models render all at once — no live tokens to show';
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="run-warning-modal live-build-modal" role="dialog" aria-modal="true" aria-label={`${build.model} skill test in progress`}>
        <div className="modal-title">
          <Sparkles aria-hidden="true" className={build.done || build.error ? undefined : 'live-build-pulse'} />
          <div>
            <span>{heading}</span>
            <strong>{build.model} · {kindLabel}</strong>
          </div>
          <button type="button" className="mini-button outline" onClick={onClose}>
            <X aria-hidden="true" />
            Close
          </button>
        </div>
        <div className="live-build-meta">
          {build.error
            ? <em className="live-build-error">{build.error}</em>
            : <em>{streamable ? `${build.text.length.toLocaleString()} characters · ` : ''}{metaText}</em>}
        </div>
        {streamable ? (
          <pre ref={scrollRef} className="live-build-stream">
            {build.text || 'Waking the model up…'}
            {!build.done && !build.error && <span className="live-build-caret" aria-hidden="true" />}
          </pre>
        ) : (
          <div className="live-build-generating">
            {!build.done && !build.error && <RefreshCw className="spin" aria-hidden="true" />}
            <span>{build.error ? 'The image run reported an error.' : build.done ? 'Image ready.' : 'Rendering the image on your hardware…'}</span>
          </div>
        )}
      </section>
    </div>
  );
}

export function DemoResultModal({ demos, onClose, onRetry, onAutoImprove, improveCounts, judgeActive }: {
  demos: DemoArtifact[];
  onClose: () => void;
  onRetry?: (demo: DemoArtifact, hint?: string) => void;
  onAutoImprove?: (demo: DemoArtifact, times: number) => void;
  improveCounts?: Record<string, number>;
  // Whether an LLM judge graded this result. When false, the score only reflects
  // structure/syntax checks — which can read 100 for an app that doesn't work.
  judgeActive?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const [hint, setHint] = useState('');
  const [autoTimes, setAutoTimes] = useState(3);
  const [whyOpen, setWhyOpen] = useState(false);
  const demo = demos[Math.min(index, demos.length - 1)];
  const improveCount = improveCounts?.[demo.model] ?? 0;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Reset transient view state when switching between demos. Done during render
  // (the React-recommended pattern) rather than in an effect, to avoid a
  // cascading re-render.
  const [prevIndex, setPrevIndex] = useState(index);
  if (index !== prevIndex) {
    setPrevIndex(index);
    setShowCode(false);
    setCopied(false);
    setHintOpen(false);
    setHint('');
    setWhyOpen(false);
  }

  const canShowCode = demo.kind === 'app' && Boolean(demo.html);
  const copyCode = () => {
    const text = demo.kind === 'code' ? demo.code : demo.html;
    if (!text) return;
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }).catch(() => undefined);
  };
  const kindLabel = demo.kind === 'app' ? 'App Builder'
    : demo.kind === 'code' ? `Code Challenge${demo.language ? ` · ${demo.language}` : ''}`
    : demo.kind === 'vision' ? 'Image Reading'
    : 'Image Lab';

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="run-warning-modal advanced-lab-preview-modal demo-result-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Demo results"
      >
        <div className="modal-title">
          <Sparkles aria-hidden="true" />
          <div>
            <span>{demos.length > 1 ? `${demos.length} demos ready to view` : 'Demo ready'}</span>
            <strong>{demo.model} · {kindLabel} · {demo.score} · {demo.grade}</strong>
          </div>
          {canShowCode && (
            <button
              type="button"
              className="mini-button outline"
              onClick={() => setShowCode((v) => !v)}
              aria-pressed={showCode}
            >
              {showCode ? <Play aria-hidden="true" /> : <Code2 aria-hidden="true" />}
              {showCode ? 'View app' : 'View code'}
            </button>
          )}
          <button type="button" className="mini-button outline" onClick={onClose}>
            <X aria-hidden="true" />
            Close
          </button>
        </div>
        {demo.kind === 'app' && demo.html && onRetry && (
          <div className="demo-retry-bar">
            <span className="demo-retry-copy">
              Not quite working? Let it keep working on it:
              {improveCount > 0 && <em className="demo-retry-count"> {improveCount} improve pass{improveCount === 1 ? '' : 'es'} so far</em>}
            </span>
            <button
              type="button"
              className="mini-button"
              onClick={() => onRetry(demo)}
              title="Hand the model its attempt and ask it to fix and complete it"
            >
              <RefreshCw aria-hidden="true" />
              Improve
            </button>
            <button
              type="button"
              className="mini-button outline"
              onClick={() => setHintOpen((v) => !v)}
              aria-pressed={hintOpen}
            >
              Improve with a hint
            </button>
            {onAutoImprove && (
              <span className="demo-auto-improve">
                <button
                  type="button"
                  className="mini-button outline"
                  onClick={() => onAutoImprove(demo, autoTimes)}
                  title={`Run up to ${autoTimes} improve passes back to back and keep the best attempt`}
                >
                  Auto-improve
                </button>
                <select
                  value={autoTimes}
                  onChange={(event) => setAutoTimes(Number(event.target.value))}
                  aria-label="Number of auto-improve passes"
                >
                  {[2, 3, 5].map((n) => <option key={n} value={n}>×{n}</option>)}
                </select>
              </span>
            )}
            <button
              type="button"
              className="mini-button outline demo-why-button"
              onClick={() => setWhyOpen((v) => !v)}
              aria-pressed={whyOpen}
            >
              Not what you expected?
            </button>
            {hintOpen && (
              <form
                className="demo-retry-hint"
                onSubmit={(event) => { event.preventDefault(); if (hint.trim()) { onRetry(demo, hint.trim()); } }}
              >
                <input
                  type="text"
                  value={hint}
                  onChange={(event) => setHint(event.target.value)}
                  placeholder="What should it fix? e.g. the pieces don't rotate"
                  aria-label="Retry hint"
                  autoFocus
                />
                <button type="submit" className="mini-button" disabled={!hint.trim()}>Send</button>
              </form>
            )}
            {whyOpen && (
              <div className="demo-why-note">
                Building a complete app in one shot is one of the hardest things you can ask a local model to do — and the smaller models that fit on most GPUs (3B–8B) often can't manage a complex game like Tetris at all, no matter how many passes they get. A broken first attempt is normal and is the test doing its job. What helps: try a <strong>coding-specialized model</strong> sized to your VRAM (like qwen2.5-coder), start with a <strong>simpler preset</strong> (Calculator or Digital clock), use <strong>Improve passes</strong> to let it iterate, and turn on <strong>Judge grading</strong> so a broken app can't sneak a top score.
              </div>
            )}
            {demo.judged === false && (
              <div className="demo-why-note demo-structure-note">
                This grade only checks structure and syntax — it can read {demo.grade ?? 'S'} even when the app doesn't actually work{judgeActive ? ' (the judge didn\'t grade this one)' : ''}. {judgeActive ? 'Re-run, or ' : 'Turn on '}<strong>Judge grading</strong> for a grade that tests whether it runs, and so Auto-improve can tell which attempt is genuinely best.
              </div>
            )}
          </div>
        )}
        {demos.length > 1 && (
          <div className="demo-result-tabs" role="tablist">
            {demos.map((entry, entryIndex) => {
              // A model can hold several results (e.g. a Code Challenge AND an
              // image reading), so every tab names what it opens — otherwise two
              // "gemma3:4b" tabs are indistinguishable until clicked.
              const kindTag = entry.kind === 'app' ? 'app'
                : entry.kind === 'code' ? 'code'
                : entry.kind === 'vision' ? 'reading'
                : 'image';
              const KindIcon = entry.kind === 'app' ? Play : entry.kind === 'code' ? Code2 : ImageIcon;
              return (
                <button
                  key={`${entry.kind}:${entry.model}`}
                  type="button"
                  role="tab"
                  aria-selected={entryIndex === index}
                  className={entryIndex === index ? 'active' : ''}
                  onClick={() => setIndex(entryIndex)}
                  title={`${getShortModelName(entry.model)} — ${kindTag} result`}
                >
                  <AvatarBust model={entry.model} size="tiny" />
                  <span>{getShortModelName(entry.model)}</span>
                  <em className="demo-tab-kind">
                    <KindIcon aria-hidden="true" />
                    {kindTag}
                  </em>
                </button>
              );
            })}
          </div>
        )}
        {demo.kind === 'code' ? (
          <div className="demo-code-wrap">
            {demo.note && <div className="demo-judge-note">🧑‍⚖️ {demo.note}</div>}
            <button type="button" className="mini-button outline demo-code-copy" onClick={copyCode}>
              <Code2 aria-hidden="true" />
              {copied ? 'Copied' : 'Copy code'}
            </button>
            <pre className="live-build-stream demo-code-view">{demo.code || 'No code was returned.'}</pre>
          </div>
        ) : demo.kind === 'app' && demo.html && showCode ? (
          <div className="demo-code-wrap">
            <button type="button" className="mini-button outline demo-code-copy" onClick={copyCode}>
              <Code2 aria-hidden="true" />
              {copied ? 'Copied' : 'Copy code'}
            </button>
            <pre className="live-build-stream demo-code-view">{demo.html}</pre>
          </div>
        ) : demo.kind === 'app' && demo.html ? (
          <iframe
            className="advanced-lab-preview-frame"
            title={`Demo app by ${demo.model}`}
            sandbox="allow-scripts"
            srcDoc={buildSandboxedPreviewHtml(demo.html)}
          />
        ) : demo.kind === 'image' && demo.imageDataUrl ? (
          <img className="advanced-lab-generated-image" src={demo.imageDataUrl} alt={`Image generated by ${demo.model}`} />
        ) : demo.kind === 'vision' ? (
          <div className="demo-vision-result">
            {demo.imageDataUrl && <img className="demo-vision-image" src={demo.imageDataUrl} alt="Image the model was asked to read" />}
            <div className="demo-vision-reading">
              <span>What {getShortModelName(demo.model)} saw</span>
              <p>{demo.description || 'No description returned.'}</p>
            </div>
          </div>
        ) : (
          <div className="utility-empty compact"><strong>Nothing to preview for this result.</strong></div>
        )}
      </section>
    </div>
  );
}

/**
 * Self-contained "view what this model made" chips. Drop `<ModelDemoChips
 * model={name} />` anywhere a model appears — it reads saved skill-test
 * artifacts itself and opens them in the shared DemoResultModal, so no prop
 * threading is needed. Renders nothing when the model has no artifacts.
 */
export function ModelDemoChips({ model, label = 'Made by this model', className }: { model: string; label?: string; className?: string }) {
  const [openDemos, setOpenDemos] = useState<DemoArtifact[] | null>(null);
  const artifacts = useMemo(() => getModelDemoArtifacts(model), [model]);
  if (artifacts.length === 0) return null;
  return (
    <div className={`model-demo-chips${className ? ` ${className}` : ''}`}>
      {label && <span className="model-demo-chips-label">{label}</span>}
      {artifacts.map((artifact) => (
        <button
          key={artifact.kind}
          type="button"
          className={`model-demo-chip ${artifact.kind}`}
          onClick={(event) => { event.stopPropagation(); setOpenDemos([artifact]); }}
          title={`View the ${artifact.kind === 'app' ? 'app' : artifact.kind === 'code' ? 'code' : artifact.kind === 'vision' ? 'image reading' : 'image'} ${getShortModelName(model)} produced (grade ${artifact.grade})`}
        >
          {artifact.kind === 'app' ? <Play aria-hidden="true" /> : artifact.kind === 'code' ? <Code2 aria-hidden="true" /> : <ImageIcon aria-hidden="true" />}
          <span>{artifact.kind === 'app' ? 'View app' : artifact.kind === 'code' ? 'View code' : artifact.kind === 'vision' ? 'View reading' : 'View image'}</span>
          <em>{artifact.grade}</em>
        </button>
      ))}
      {openDemos && <DemoResultModal demos={openDemos} onClose={() => setOpenDemos(null)} />}
    </div>
  );
}
