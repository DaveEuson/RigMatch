// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useDialog } from '../lib/useDialog';
import type { NavId } from './SideMenu';
import { AlertCircle, CheckCircle, ExternalLink, Trophy, X } from 'lucide-react';
import type { ReactNode } from 'react';

export function FirstRunTutorial({
  stepIndex,
  installedCount,
  modelCount,
  ollamaReady,
  ollamaVersion,
  lmStudioReady,
  lmStudioCount,
  onStepChange,
  onClose,
  onSelectNav,
}: {
  stepIndex: number;
  installedCount: number;
  modelCount: number;
  ollamaReady: boolean;
  ollamaVersion: string | null;
  lmStudioReady: boolean;
  lmStudioCount: number;
  onStepChange: (stepIndex: number) => void;
  onClose: () => void;
  onSelectNav: (id: NavId) => void;
}) {
  const localProviderReady = ollamaReady || lmStudioReady;
  const providerSummary = ollamaReady && lmStudioReady
    ? `Ollama + LM Studio ready · ${installedCount} local models`
    : lmStudioReady
      ? `LM Studio ready · ${lmStudioCount} local model${lmStudioCount === 1 ? '' : 's'}`
      : ollamaReady
        ? `Ollama ready${ollamaVersion ? ` · v${ollamaVersion}` : ''}${installedCount > 0 ? ` · ${installedCount} installed` : ''}`
        : 'No local AI provider detected yet';
  const steps: Array<{ round: string; title: string; body: ReactNode; prize: string; navId: NavId; hidden?: boolean }> = [
    {
      round: '👋 Welcome',
      title: 'Find the best local AI for this computer',
      body: (
        <div className="tutorial-welcome-screen">
          <p className="tutorial-intro-lead">
            RigMatch tests local models through Ollama or LM Studio, measures speed and answer quality on this computer, then recommends the best fit for your hardware.
          </p>
          <div className={`tutorial-status-strip ${localProviderReady ? 'ready' : 'offline'}`}>
            {localProviderReady ? (
              <><CheckCircle aria-hidden="true" /> {providerSummary}{modelCount > 0 ? ` · ${modelCount} in catalog` : ''}</>
            ) : (
              <><AlertCircle aria-hidden="true" /> No local test engine detected — start Ollama or LM Studio local server.</>
            )}
          </div>
          {/* No how-it-works cards here: "The Show" panel explains the same
              three beats in the show's own voice. Saying it twice in one
              tutorial was reviewer feedback #1 — every panel earns its text. */}
        </div>
      ),
      prize: 'Everything runs on this computer. No cloud, no account, no subscription.',
      navId: 'models' as NavId,
    },
    {
      round: '🔧 Setup',
      // When a provider is already running there is nothing to set up: the panel
      // only repeated the readiness strip from Welcome in a second layout
      // (reviewer feedback — "saying Ollama is ready, repeated on multiple
      // tabs"). It now only exists when there is actual setup to do.
      hidden: localProviderReady,
      title: 'Connect a local AI provider to test models',
      body: (
        <div className="tutorial-intro-body">
          <div className="tutorial-ollama-status offline">
            <AlertCircle aria-hidden="true" />
            Ollama not detected
          </div>
          <p className="tutorial-intro-lead">RigMatch can test through Ollama or LM Studio's local server. Ollama is still required for one-click catalog downloads.</p>
          <p>If your models are only in LM Studio, start LM Studio's local server and click <strong>Check Local</strong>. RigMatch will list those local models for testing and chat.</p>
          <div className="tutorial-install-steps">
            <button
              type="button"
              className="primary-button"
              onClick={() => window.open('https://ollama.ai', '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink aria-hidden="true" />
              Download Ollama free at ollama.ai
            </button>
            <p>After installing, <strong>start Ollama</strong>, then re-open RigMatch. The status above will turn green.</p>
          </div>
        </div>
      ),
      prize: 'Connect Ollama or start LM Studio local server, then check again.',
      navId: 'lan' as NavId,
    },
    {
      round: '🎬 The Show',
      title: 'The AI Dating Show — on your PC',
      body: (
        <div className="tutorial-intro-body">
          <div className="tutorial-welcome-hero">
            <p className="tutorial-intro-lead">
              There are hundreds of AI models out there — and the one that feels <em>magical</em> on someone else's computer might crawl on yours.<br /><br />
              RigMatch helps you find <strong>your</strong> perfect match. And it does it like a <strong>gameshow</strong>. 🎬
            </p>
          </div>
          <div className="tutorial-show-format">
            <div className="show-format-step">
              <span>🎤</span>
              <div><strong>Auditions</strong><em>Browse hundreds of AI models. We flag which ones your rig can actually handle.</em></div>
            </div>
            <div className="show-format-step">
              <span>⚡</span>
              <div><strong>Speed Dating</strong><em>Pick up to 5 contestants. We run them through the same questions and time every answer.</em></div>
            </div>
            <div className="show-format-step">
              <span>🏆</span>
              <div><strong>The Final Rose</strong><em>Scorecards rank every model by answer quality, speed, finish rate, and computer fit — one walks away as your Top Match.</em></div>
            </div>
          </div>
          <div className="tutorial-intro-callout">
            🎯 Everything runs <strong>on this computer</strong>. No cloud, no subscription, no data leaving your machine.
          </div>
        </div>
      ),
      prize: "Let's find your perfect local AI match.",
      navId: 'models' as NavId,
    },
    {
      round: '🤔 Meet AI',
      title: 'Meet your AI',
      body: (
        <div className="tutorial-intro-body">
          <p className="tutorial-intro-lead">You know how ChatGPT seems to <em>"just know"</em> almost everything? That's an <strong>LLM</strong> — a Large Language Model.</p>
          <p>It's a program trained on billions of pages of text — books, code, articles, conversations. It learned patterns in language so it can write, explain, translate, code, and brainstorm.</p>
          <div className="tutorial-intro-callout">
            💡 Think of it like a really well-read friend who never gets tired of your questions — and never judges you for asking the same thing twice.
          </div>
        </div>
      ),
      prize: 'LLM = Large Language Model. The brain behind the chat.',
      navId: 'models' as NavId,
    },
  ];
  // Drop panels with nothing to say (e.g. Setup when a provider is already
  // running) instead of rendering them as filler. The rail renumbers itself.
  const visibleSteps = steps.filter((entry) => !entry.hidden);
  const currentIndex = Math.min(Math.max(stepIndex, 0), visibleSteps.length - 1);
  const step = visibleSteps[currentIndex];
  const isLastStep = currentIndex === visibleSteps.length - 1;

  // The only role="dialog" in the app that did not do this. It is the FIRST
  // thing on screen at first run, behind a full-viewport scrim: focus stayed on
  // <body>, Escape did nothing, and reaching its own Next button meant tabbing
  // through the entire dimmed app behind it.
  const tutorialRef = useDialog<HTMLElement>(onClose);

  const goToStep = (nextIndex: number) => {
    const boundedIndex = Math.min(Math.max(nextIndex, 0), visibleSteps.length - 1);
    onStepChange(boundedIndex);
    onSelectNav(visibleSteps[boundedIndex].navId);
  };

  return (
    <div className="tutorial-backdrop" role="presentation">
      <section
        ref={tutorialRef}
        className="tutorial-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
      >
        <div className="tutorial-title">
          <div className="tutorial-badge" aria-hidden="true">
            <Trophy />
          </div>
          <div>
            <span>{step.round}</span>
            <strong id="tutorial-title">{step.title}</strong>
          </div>
          <button type="button" className="mini-button outline" onClick={onClose}>
            <X aria-hidden="true" />
            Close
          </button>
        </div>

        <div className="tutorial-body">
          {typeof step.body === 'string' ? <p>{step.body}</p> : step.body}
          <div className="tutorial-prize">
            <span>Quick Note</span>
            <strong>{step.prize}</strong>
          </div>
          <ol className="tutorial-steps" aria-label="Tutorial progress">
            {visibleSteps.map((tutorialStep, index) => (
              <li key={tutorialStep.round} className={index === currentIndex ? 'active' : index < currentIndex ? 'done' : ''}>
                <button type="button" onClick={() => goToStep(index)}>
                  <span>{index + 1}</span>
                  <strong>{tutorialStep.title}</strong>
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className="tutorial-actions">
          <button type="button" className="mini-button outline" onClick={() => goToStep(currentIndex - 1)} disabled={currentIndex === 0}>
            Back
          </button>
          {isLastStep ? (
            <button type="button" className="primary-button compact" onClick={() => { onSelectNav('models'); onClose(); }}>
              <Trophy aria-hidden="true" />
              Start Matching
            </button>
          ) : (
            <button type="button" className="primary-button compact" onClick={() => goToStep(currentIndex + 1)}>
              Next
            </button>
          )}
          <button type="button" className="quiet-link" onClick={onClose}>
            Skip tour
          </button>
        </div>
      </section>
    </div>
  );
}
