// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getThemeSwatches, themeOptions, type ThemeId, type UiMode } from '../lib/appConfig';
import { getModelAvatarSrc } from '../lib/modelAvatars';
import { BadgeCase } from './AchievementShelf';
import { UiIcon, type UiIconName } from './icons/UiIcon';
import brandIcon from '../assets/rigmatch-brand-icon.svg';

/** How a local service answered the last time it was asked. */
/** 'off' is a service that is not running and does not need to be: Ollama while LM Studio carries the tests. */
export type ConnectionState = 'ok' | 'testing' | 'down' | 'untested' | 'off';

export type TopTab = {
  id: string;
  label: string;
  icon: UiIconName;
  /** A number worth knowing before the click, e.g. new models. */
  count?: number;
};

const CONNECTION_WORDS: Record<ConnectionState, string> = {
  ok: 'connected',
  testing: 'checking',
  down: 'not answering',
  untested: 'not checked',
  off: 'not running',
};

/**
 * The bar across the top of every screen, the same in both modes.
 *
 * Left to right: the app, where you are (Simple's four-step tracker or
 * Advanced's tabs), the Top Match, the badge case, the theme, the local
 * services, Chat, Donate, Settings, and the mode switch. It replaces the side
 * menu, the stats deck and the channel row: one place to look for where you are.
 */
export function TopBar({
  uiMode,
  onUiModeChange,
  tabs,
  activeTab,
  onSelectTab,
  tracker,
  topMatch,
  onOpenTopMatch,
  themeId,
  onThemeChange,
  connections,
  onOpenConnections,
  onOpenSettings,
  onOpenChat,
  onOpenSupport,
}: {
  uiMode: UiMode;
  onUiModeChange: (mode: UiMode) => void;
  /** Advanced: the screens. */
  tabs?: TopTab[];
  activeTab?: string;
  onSelectTab?: (id: string) => void;
  /** Simple: the wizard's own step tracker, rendered by the wizard. */
  tracker?: ReactNode;
  topMatch?: { model: string; name: string; scoreLabel: string } | null;
  onOpenTopMatch?: () => void;
  themeId: ThemeId;
  onThemeChange: (id: ThemeId) => void;
  /** lmStudio only when it is running: most people never install it, and a grey chip for it would be clutter. */
  connections: { ollama: ConnectionState; comfy: ConnectionState; lmStudio?: ConnectionState };
  onOpenConnections: () => void;
  onOpenSettings?: () => void;
  onOpenChat: () => void;
  /** The donation dialog. */
  onOpenSupport: () => void;
}) {
  const advanced = uiMode === 'advanced';
  return (
    <header className={advanced ? 'top-bar advanced' : 'top-bar simple'}>
      <div className="top-bar-brand">
        <img src={brandIcon} alt="" width={32} height={32} />
        <span className="top-bar-wordmark">RigMatch</span>
      </div>

      {advanced && tabs ? (
        <nav className="top-bar-tabs" aria-label="Screens">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={tab.id === activeTab ? 'top-tab active' : 'top-tab'}
              aria-current={tab.id === activeTab ? 'page' : undefined}
              onClick={() => onSelectTab?.(tab.id)}
            >
              <UiIcon name={tab.icon} size={18} />
              <span>{tab.label}</span>
              {tab.count ? <span className="top-tab-count">{tab.count}</span> : null}
            </button>
          ))}
        </nav>
      ) : (
        <div className="top-bar-tracker">{tracker}</div>
      )}

      <div className="top-bar-tools">
        {advanced && topMatch && (
          <button
            type="button"
            className="top-match-chip"
            onClick={onOpenTopMatch}
            aria-label={`Top Match: ${topMatch.name}, ${topMatch.scoreLabel}. Open Results`}
            title={`Top Match: ${topMatch.name}`}
          >
            <img src={getModelAvatarSrc(topMatch.model)} alt="" width={26} height={26} />
            <span className="top-match-chip-name">{topMatch.name}</span>
            <span className="top-match-score">{topMatch.scoreLabel}</span>
          </button>
        )}
        <BadgeCase />
        <ThemeButton themeId={themeId} onChange={onThemeChange} />
        <button
          type="button"
          className="top-bar-connections"
          onClick={onOpenConnections}
          title="Local AI services. Open My PC"
          aria-label={`Ollama ${CONNECTION_WORDS[connections.ollama]}, ${connections.lmStudio ? `LM Studio ${CONNECTION_WORDS[connections.lmStudio]}, ` : ''}ComfyUI ${CONNECTION_WORDS[connections.comfy]}. Open My PC`}
        >
          <span className="top-bar-service">
            <UiIcon name="plug" size={16} />
            <span className="top-bar-service-name">Ollama</span>
            <i className={`conn-dot ${connections.ollama}`} aria-hidden="true" />
          </span>
          {connections.lmStudio && (
            <span className="top-bar-service">
              <UiIcon name="plug" size={16} />
              <span className="top-bar-service-name">LM Studio</span>
              <i className={`conn-dot ${connections.lmStudio}`} aria-hidden="true" />
            </span>
          )}
          <span className="top-bar-service">
            <UiIcon name="nodes" size={16} />
            <span className="top-bar-service-name">ComfyUI</span>
            <i className={`conn-dot ${connections.comfy}`} aria-hidden="true" />
          </span>
        </button>
        <button type="button" className="top-bar-icon-btn" onClick={onOpenChat} title="Open RigMatch Chat" aria-label="Open RigMatch Chat">
          <UiIcon name="chat" size={20} />
        </button>
        {/* RigMatch is donationware. The side menu's button went with the side
            menu, and Settings is Advanced only, so nothing said so in Simple. */}
        <button
          type="button"
          className="top-bar-donate"
          onClick={onOpenSupport}
          title="RigMatch is donationware: every feature is free"
          // The word hides below 1600px wide, like Settings', and hidden text
          // names nothing.
          aria-label="Donate"
        >
          <UiIcon name="coffee" size={18} />
          <span>Donate</span>
        </button>
        {advanced && onOpenSettings && (
          <button type="button" className="top-bar-settings" onClick={onOpenSettings}>
            <UiIcon name="gear" size={18} />
            <span>Settings</span>
          </button>
        )}
        <div className="top-bar-mode" role="group" aria-label="Mode">
          <button type="button" aria-label="Simple Mode" aria-pressed={!advanced} className={!advanced ? 'active' : ''} onClick={() => onUiModeChange('beginner')}>
            Simple
          </button>
          <button type="button" aria-label="Advanced Mode" aria-pressed={advanced} className={advanced ? 'active' : ''} onClick={() => onUiModeChange('advanced')}>
            Advanced
          </button>
        </div>
      </div>
    </header>
  );
}

/** The palette button: the five themes, one click away instead of in Settings. */
function ThemeButton({ themeId, onChange }: { themeId: ThemeId; onChange: (id: ThemeId) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const current = themeOptions.find((theme) => theme.id === themeId) ?? themeOptions[0];
  // Closing removes the menu, so focus inside it would fall to the page:
  // hand it back to the palette button instead.
  const close = () => {
    if (wrapRef.current?.contains(document.activeElement)) buttonRef.current?.focus();
    setOpen(false);
  };
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="top-bar-theme" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="top-bar-icon-btn"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Theme: ${current.label}`}
        title={`Theme: ${current.label}`}
        onClick={() => setOpen((value) => !value)}
      >
        <UiIcon name="palette" size={20} />
      </button>
      {open && (
        <div className="top-bar-theme-menu" role="group" aria-label="Theme">
          {themeOptions.map((theme) => (
            <button
              key={theme.id}
              type="button"
              aria-pressed={theme.id === themeId}
              className={theme.id === themeId ? 'active' : ''}
              onClick={() => { onChange(theme.id); close(); }}
            >
              <span className="theme-swatch" aria-hidden="true">
                {getThemeSwatches(theme.id).map((swatch, index) => <i key={index} style={{ background: swatch }} />)}
              </span>
              <span>{theme.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
