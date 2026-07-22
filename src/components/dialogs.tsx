import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Code2, Coffee, ExternalLink, Heart, MessageSquare, Share2, ShoppingCart, Terminal, Trash2, X } from 'lucide-react';
import { agentArcadeApi } from '../api';
import type { ModelRow, NetworkHost, SystemProfile, TestedModelScore } from '../types';
import { formatGb } from '../lib/format';
import { sumModelRowGb, getShortModelName } from '../lib/modelCatalog';
import { BUY_ME_A_COFFEE_URL, amazonUrl } from '../lib/appConfig';
import { playJingle } from '../lib/sound';
import { AvatarBust, MachineAvatar } from './Avatars';
import { ShareScorecard } from './ShareScorecard';

export function DeleteModelModal({
  row,
  host,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  row: ModelRow;
  host?: NetworkHost;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const modelName = row.installedModel?.model ?? row.displayName;
  const sizeLabel = row.sizeGb ? formatGb(row.sizeGb) : 'size unknown';
  const hostName = host?.hostname ?? 'selected computer';

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="run-warning-modal destructive-modal" role="dialog" aria-modal="true" aria-labelledby="delete-model-title">
        <div className="modal-title danger">
          <Trash2 aria-hidden="true" />
          <div>
            <span>Delete Model</span>
            <strong id="delete-model-title">{modelName}</strong>
          </div>
        </div>
        <div className="modal-body">
          <p>
            This removes <strong>{modelName}</strong> from Ollama on <strong>{hostName}</strong>. It can free about
            <strong> {sizeLabel}</strong>, but the model must be downloaded again before RigMatch can test or chat with it.
          </p>
          <div className="modal-warning-grid">
            <div>
              <span>Target Computer</span>
              <strong>{hostName}</strong>
              <em>{host?.baseUrl ?? 'Local provider API'}</em>
            </div>
            <div>
              <span>Model Size</span>
              <strong>{sizeLabel}</strong>
              <em>Disk space returns after Ollama removes the model files.</em>
            </div>
            <div>
              <span>Scores</span>
              <strong>Also removed</strong>
              <em>Saved match scores for this model are cleared from this session.</em>
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="mini-button outline" onClick={onCancel} disabled={isDeleting}>
            <X aria-hidden="true" />
            Cancel
          </button>
          <button type="button" className="danger-button compact" onClick={onConfirm} disabled={isDeleting}>
            <Trash2 aria-hidden="true" />
            {isDeleting ? 'Deleting' : 'Delete Model'}
          </button>
        </div>
      </section>
    </div>
  );
}

export function CloseCleanupModal({
  installedRows,
  unscoredRows,
  lowScoredRows,
  isDeleting,
  message,
  onDeleteUnscored,
  onDeleteLowScored,
  onCancel,
  onUnderstand,
}: {
  installedRows: ModelRow[];
  unscoredRows: ModelRow[];
  lowScoredRows: ModelRow[];
  isDeleting: boolean;
  message: string | null;
  onDeleteUnscored: () => void;
  onDeleteLowScored: () => void;
  onCancel: () => void;
  onUnderstand: () => void;
}) {
  const installedGb = sumModelRowGb(installedRows);
  const unscoredGb = sumModelRowGb(unscoredRows);
  const lowScoredGb = sumModelRowGb(lowScoredRows);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="run-warning-modal destructive-modal model-cleanup-modal" role="dialog" aria-modal="true" aria-labelledby="close-cleanup-title">
        <div className="modal-title danger">
          <Trash2 aria-hidden="true" />
          <div>
            <span>Before You Close</span>
            <strong id="close-cleanup-title">Unused Ollama models can take up a lot of space</strong>
          </div>
        </div>
        <div className="modal-body">
          <p>
            RigMatch leaves downloaded Ollama models on this computer so you can test or chat later.
            If you are not using some of them, deleting those models can free meaningful disk space.
          </p>
          <div className="modal-warning-grid model-cleanup-summary">
            <div>
              <span>Installed Models</span>
              <strong>{installedRows.length}</strong>
              <em>{formatGb(installedGb)} estimated on disk.</em>
            </div>
            <div>
              <span>Not Scored</span>
              <strong>{unscoredRows.length}</strong>
              <em>{formatGb(unscoredGb)} that RigMatch has not benchmarked.</em>
            </div>
            <div>
              <span>Scored 80 or Below</span>
              <strong>{lowScoredRows.length}</strong>
              <em>{formatGb(lowScoredGb)} from lower-ranked matches.</em>
            </div>
          </div>
          {message && (
            <div className="run-download-warning model-cleanup-message">
              <AlertTriangle size={14} aria-hidden="true" />
              <span>{message}</span>
            </div>
          )}
        </div>
        <div className="model-cleanup-actions" aria-label="Model cleanup options">
          <button type="button" className="mini-button outline model-cleanup-cancel" onClick={onCancel} disabled={isDeleting}>
            <X aria-hidden="true" />
            Cancel
          </button>
          <button
            type="button"
            className="danger-button compact"
            onClick={onDeleteUnscored}
            disabled={isDeleting || unscoredRows.length === 0}
          >
            <Trash2 aria-hidden="true" />
            {isDeleting ? 'Deleting...' : `Delete Not Scored (${unscoredRows.length})`}
          </button>
          <button
            type="button"
            className="danger-button compact"
            onClick={onDeleteLowScored}
            disabled={isDeleting || lowScoredRows.length === 0}
          >
            <Trash2 aria-hidden="true" />
            {isDeleting ? 'Deleting...' : `Delete 80 or Below (${lowScoredRows.length})`}
          </button>
          <button type="button" className="mini-button outline" onClick={onUnderstand} disabled={isDeleting}>
            <Check aria-hidden="true" />
            I Understand
          </button>
        </div>
      </section>
    </div>
  );
}

const SUPPORT_HARDWARE_LINKS = [
  {
    label: 'RTX 4070 Ti GPU',
    desc: '12 GB VRAM — runs 13B models with headroom. Best price-to-VRAM upgrade for most rigs.',
    query: 'RTX 4070 Ti graphics card 12GB',
  },
  {
    label: 'RTX 4090 GPU',
    desc: '24 GB VRAM — the local AI endgame. 70B models in reach. Serious kit for serious models.',
    query: 'RTX 4090 graphics card 24GB',
  },
  {
    label: 'AI-Ready Gaming Desktop',
    desc: 'Pre-built Windows PC with high-VRAM GPU — plug in Ollama and go, no assembly required.',
    query: 'gaming desktop RTX 4070 Ti AI machine learning',
  },
  {
    label: 'Apple Mac Studio M4 Max',
    desc: '36–128 GB unified memory. Runs 30B models silently. Every GB counts for local AI.',
    query: 'Apple Mac Studio M4 Max',
  },
] as const;

export function SupportModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="support-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
          <X aria-hidden="true" />
        </button>
        <div className="support-modal-header">
          <span>☕</span>
          <div>
            <h2 id="support-modal-title">Support RigMatch</h2>
            <p>Free to use, forever. If it saved you time hunting the right model, a coffee keeps the lights on.</p>
          </div>
        </div>

        <a
          className="support-coffee-btn"
          href={BUY_ME_A_COFFEE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Coffee aria-hidden="true" />
          Buy Me a Coffee
          <ExternalLink aria-hidden="true" className="support-ext-icon" />
        </a>

        <div className="support-divider">
          <span>or level up your rig</span>
        </div>

        <p className="support-hardware-intro">
          More VRAM = more models. These affiliate links cost you nothing extra and send a small cut back to RigMatch development.
        </p>

        <div className="support-hardware-grid">
          {SUPPORT_HARDWARE_LINKS.map((link) => (
            <a
              key={link.label}
              href={amazonUrl(link.query)}
              target="_blank"
              rel="noopener noreferrer"
              className="support-hardware-card"
              aria-label={`Search for ${link.label} on Amazon`}
            >
              <div className="support-hardware-card-inner">
                <strong>{link.label}</strong>
                <p>{link.desc}</p>
              </div>
              <span className="support-amazon-badge">
                <ShoppingCart aria-hidden="true" />
                Amazon
              </span>
            </a>
          ))}
        </div>

        <p className="support-disclosure">
          Affiliate links — purchases support RigMatch.AI at no extra cost to you.
        </p>
      </section>
    </div>
  );
}

export function ClearDataModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="run-warning-modal destructive-modal" role="dialog" aria-modal="true" aria-labelledby="clear-data-title">
        <div className="modal-title danger">
          <Trash2 aria-hidden="true" />
          <div>
            <span>Clear Data</span>
            <strong id="clear-data-title">Reset RigMatch Data?</strong>
          </div>
        </div>
        <div className="modal-body">
          <p>
            This clears local RigMatch data: logs, scores, Speed Dating results, chat, queued downloads, saved theme,
            and custom benchmark questions. It does <strong>not</strong> delete Ollama models.
          </p>
          <div className="modal-warning-grid">
            <div>
              <span>Clears</span>
              <strong>App history</strong>
              <em>Scores, logs, comparison rankings, and chat reset immediately.</em>
            </div>
            <div>
              <span>Restores</span>
              <strong>Defaults</strong>
              <em>Question suite, theme, model shortlist, and run state return to first-run defaults.</em>
            </div>
            <div>
              <span>Keeps</span>
              <strong>Ollama models</strong>
              <em>Use the trash button in Contestants to delete downloaded model files.</em>
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="mini-button outline" onClick={onCancel}>
            <X aria-hidden="true" />
            Cancel
          </button>
          <button type="button" className="danger-button compact" onClick={onConfirm}>
            <Trash2 aria-hidden="true" />
            Clear All Data
          </button>
        </div>
      </section>
    </div>
  );
}

const CONFETTI_PIECES = [
  { x: '8%',  col: '#ff6b9d', delay: '0s',    dur: '2.1s', rot: '15deg',  size: '9px' },
  { x: '17%', col: '#ffd93d', delay: '0.3s',  dur: '2.5s', rot: '-20deg', size: '7px' },
  { x: '25%', col: '#6bcb77', delay: '0.1s',  dur: '1.9s', rot: '40deg',  size: '8px' },
  { x: '33%', col: '#4d96ff', delay: '0.5s',  dur: '2.3s', rot: '-10deg', size: '6px' },
  { x: '42%', col: '#ff6b9d', delay: '0.7s',  dur: '2.0s', rot: '30deg',  size: '10px' },
  { x: '50%', col: '#ffd93d', delay: '0.2s',  dur: '2.6s', rot: '-35deg', size: '7px' },
  { x: '58%', col: '#c77dff', delay: '0.9s',  dur: '1.8s', rot: '20deg',  size: '9px' },
  { x: '66%', col: '#6bcb77', delay: '0.4s',  dur: '2.2s', rot: '-25deg', size: '8px' },
  { x: '74%', col: '#ff6b9d', delay: '0.6s',  dur: '2.4s', rot: '45deg',  size: '6px' },
  { x: '83%', col: '#ffd93d', delay: '0.1s',  dur: '2.0s', rot: '-15deg', size: '10px' },
  { x: '91%', col: '#4d96ff', delay: '0.8s',  dur: '2.7s', rot: '10deg',  size: '7px' },
  { x: '12%', col: '#c77dff', delay: '1.1s',  dur: '2.1s', rot: '-30deg', size: '8px' },
  { x: '38%', col: '#ff6b9d', delay: '1.3s',  dur: '1.9s', rot: '25deg',  size: '9px' },
  { x: '62%', col: '#ffd93d', delay: '1.0s',  dur: '2.3s', rot: '-40deg', size: '6px' },
  { x: '78%', col: '#6bcb77', delay: '1.4s',  dur: '2.5s', rot: '35deg',  size: '7px' },
  { x: '95%', col: '#c77dff', delay: '0.5s',  dur: '2.0s', rot: '-20deg', size: '8px' },
];

export function ChoiceCruiseModal({
  model,
  host,
  score,
  system,
  onClose,
}: {
  model: string;
  host?: NetworkHost;
  score?: TestedModelScore | null;
  system: SystemProfile;
  onClose: () => void;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const hostName = host?.hostname ?? 'This computer';
  const shortModelName = getShortModelName(model);

  useEffect(() => {
    playJingle('its-a-match');
  }, []);

  return (
    <div className="modal-backdrop cruise-backdrop" role="presentation">
      <section className="choice-cruise-modal" role="dialog" aria-modal="true" aria-labelledby="choice-cruise-title">
        <div className="cruise-confetti" aria-hidden="true">
          {CONFETTI_PIECES.map((p, i) => (
            <span
              key={i}
              className="cruise-confetti-piece"
              style={{
                left: p.x,
                background: p.col,
                animationDelay: p.delay,
                animationDuration: p.dur,
                transform: `rotate(${p.rot})`,
                width: p.size,
                height: p.size,
              } as React.CSSProperties}
            />
          ))}
        </div>

        <div className="cruise-title">
          <div>
            <span>It&apos;s a match</span>
            <strong id="choice-cruise-title">{model}</strong>
            <em>Saved as your Top Match for {hostName}. Your Ollama setup is untouched.</em>
          </div>
          {score && (
            <button
              type="button"
              className="primary-button compact cruise-share-btn"
              onClick={() => setShareOpen(true)}
              title="Share your match as an image — GPU, model, and score"
            >
              <Share2 aria-hidden="true" />
              Share match
            </button>
          )}
          <button type="button" className="mini-button outline" onClick={onClose}>
            <X aria-hidden="true" />
            Close
          </button>
        </div>

        <div className="cruise-scene" aria-hidden="true">
          <span className="cruise-sun" />
          <span className="cruise-heart heart-one">
            <Heart aria-hidden="true" />
          </span>
          <span className="cruise-heart heart-two">
            <Heart aria-hidden="true" />
          </span>
          <div className="cruise-boat">
            <div className="cruise-passengers">
              <MachineAvatar host={host} size="small" />
              <AvatarBust model={model} size="small" />
            </div>
            <span className="boat-cabin" />
            <span className="boat-sail" />
            <span className="boat-hull" />
          </div>
          <span className="cruise-wave wave-one" />
          <span className="cruise-wave wave-two" />
        </div>

        <div className="cruise-caption">
          <span>Romantic cruise launched</span>
          <strong>{hostName} + {shortModelName}</strong>
          <em>This is just the victory animation. Your installed models and Ollama settings are unchanged.</em>
        </div>

        <div className="cruise-what-next">
          <span>Your chosen model is ready — here&apos;s how to use it</span>
          <div className="whats-next-grid">
            <button
              type="button"
              className="whats-next-item whats-next-action"
              onClick={async () => {
                const result = await agentArcadeApi.openChatApp();
                if (!result?.ok) alert('RigMatch Chat companion not found.\n\nDownload it from the Releases page or build it from source:\n  cd rigmatch-chat && npx tauri build');
              }}
            >
              <MessageSquare aria-hidden="true" />
              <div>
                <strong>RigMatch Chat</strong>
                <em>Open RigMatch Chat — your AIM-style local AI messenger. {shortModelName} is already online.</em>
              </div>
            </button>
            <div className="whats-next-item">
              <Terminal aria-hidden="true" />
              <div>
                <strong>Terminal</strong>
                <code>ollama run {model}</code>
              </div>
            </div>
            <div className="whats-next-item">
              <Code2 aria-hidden="true" />
              <div>
                <strong>VS Code (Continue.dev)</strong>
                <em>Install the Continue extension, then select {shortModelName} as your Autocomplete or Chat model. No API key needed.</em>
              </div>
            </div>
            <div className="whats-next-item">
              <ExternalLink aria-hidden="true" />
              <div>
                <strong>Open WebUI</strong>
                <em>A full ChatGPT-style browser interface. Run it with Docker and it auto-connects to Ollama at localhost:11434.</em>
              </div>
            </div>
            <div className="whats-next-item">
              <Code2 aria-hidden="true" />
              <div>
                <strong>Python / JavaScript</strong>
                <code>{'import ollama\nollama.chat("' + model + '",\n  [{"role":"user","content":"Hi"}])'}</code>
              </div>
            </div>
            <div className="whats-next-item">
              <ExternalLink aria-hidden="true" />
              <div>
                <strong>Any app via REST</strong>
                <em>Anything that speaks OpenAI format works. Point it at <code>localhost:11434/v1</code> with no API key.</em>
              </div>
            </div>
            <a
              className="whats-next-item whats-next-action whats-next-support"
              href={BUY_ME_A_COFFEE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Coffee aria-hidden="true" />
              <div>
                <strong>Support RigMatch</strong>
                <em>Free to use, donationware. If it saved you time, a coffee keeps it going.</em>
              </div>
            </a>
          </div>
        </div>
      </section>

      {shareOpen && score && (
        <ShareScorecard model={model} score={score} system={system} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}
