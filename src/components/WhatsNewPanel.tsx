// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useMemo, useState } from 'react';
import type { CatalogModel, ModelRow } from '../types';
import { getModelOrigin } from '../lib/modelOrigins';
import { getModelAvatarSrc } from '../lib/modelAvatars';
import {
  getModelNewsItems,
  getNotificationDetail,
  type ModelNewsItem,
  type ModelNewsState,
  type ModelNotificationPermission,
} from '../lib/modelNews';

type WhatsNewPanelProps = {
  active: boolean;
  catalog: CatalogModel[];
  catalogMeta: { syncedAt: string; source: string; error: string | null };
  rows: ModelRow[];
  modelNews: ModelNewsState;
  notificationsEnabled: boolean;
  notificationPermission: ModelNotificationPermission;
  isScanning: boolean;
  getModelSpecialties: (model: string) => string[];
  formatHistoryTime: (timestamp: string) => string;
  formatGb: (value: number) => string;
  formatPullCount: (value: number) => string;
  onRefresh: () => void;
  onToggleNotifications: () => void;
  onOpenModel: (model: string) => void;
};

export function WhatsNewPanel({
  active,
  catalog,
  catalogMeta,
  rows,
  modelNews,
  notificationsEnabled,
  notificationPermission,
  isScanning,
  getModelSpecialties,
  formatHistoryTime,
  formatGb,
  formatPullCount,
  onRefresh,
  onToggleNotifications,
  onOpenModel,
}: WhatsNewPanelProps) {
  const installedNames = useMemo(
    () => new Set(rows.filter((row) => row.installed).map((row) => normalizeModelName(row.displayName))),
    [rows],
  );
  const latestNewIds = useMemo(() => new Set(modelNews.latestNewModelIds), [modelNews.latestNewModelIds]);
  const newsItems = useMemo(
    () => getModelNewsItems(catalog, modelNews, installedNames),
    [catalog, installedNames, modelNews],
  );
  const latestDrops = newsItems.filter((item) => latestNewIds.has(item.id));
  const liveCount = catalog.filter((model) => model.live).length;
  const lastChecked = modelNews.lastCheckedAt ? formatHistoryTime(modelNews.lastCheckedAt) : 'Not checked yet';
  const notificationsDetail = getNotificationDetail(notificationsEnabled, notificationPermission);

  // Two views of one list: what the last scan found, and everything recent.
  const [scope, setScope] = useState<'new' | 'recent'>(latestDrops.length > 0 ? 'new' : 'recent');
  const shown = scope === 'new' ? latestDrops : newsItems.slice(0, 24);

  return (
    <section className={active ? 'panel whats-new-panel panel-focused' : 'panel whats-new-panel'} aria-label="What's New">
      <header className="news-head">
        <div>
          <h2>What's New</h2>
          <p>
            RigMatch watches the live Ollama catalog. When it sees a model it hasn't seen before, it lands here.
            {' '}Last checked {lastChecked}.
            {catalogMeta.error ? ` ${catalogMeta.source}: ${catalogMeta.error}` : ''}
          </p>
        </div>
        <div className="news-actions">
          <button type="button" className="btn btn-line" onClick={onRefresh} disabled={isScanning}>
            {isScanning ? 'Checking…' : 'Check now'}
          </button>
          <button
            type="button"
            className="news-switch"
            role="switch"
            aria-checked={notificationsEnabled}
            onClick={onToggleNotifications}
            title={notificationsDetail}
          >
            <span className="news-switch-track" aria-hidden="true"><i /></span>
            Tell me when a new one lands
          </button>
        </div>
      </header>

      <div className="screen-tabs news-tabs" role="group" aria-label="Which models">
        <button type="button" aria-pressed={scope === 'new'} onClick={() => setScope('new')}>
          New this scan <span className="news-count">{latestDrops.length}</span>
        </button>
        <button type="button" aria-pressed={scope === 'recent'} onClick={() => setScope('recent')}>
          Recently seen <span className="news-count">{Math.min(newsItems.length, 24)}</span>
        </button>
        <span className="news-tabs-note">
          {catalog.length} watched · {liveCount} live in this scan · {notificationsEnabled ? 'notifications on' : 'notifications off'}
        </span>
      </div>

      {shown.length > 0 ? (
        <ol className="model-news-list">
          {shown.map((item) => (
            <ModelNewsListItem
              key={item.id}
              item={item}
              isLatest={latestNewIds.has(item.id)}
              getModelSpecialties={getModelSpecialties}
              formatHistoryTime={formatHistoryTime}
              formatGb={formatGb}
              formatPullCount={formatPullCount}
              onOpenModel={onOpenModel}
            />
          ))}
        </ol>
      ) : (
        <div className="news-empty">
          {scope === 'new' ? (
            <>
              <strong>Nothing new since the last scan</strong>
              <span>RigMatch is caught up with its saved snapshot. Check now to scan again.</span>
            </>
          ) : (
            <>
              <strong>No catalog snapshot yet</strong>
              <span>Check now and RigMatch will start watching from the current Ollama catalog.</span>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function ModelNewsListItem({
  item,
  isLatest,
  getModelSpecialties,
  formatHistoryTime,
  formatGb,
  formatPullCount,
  onOpenModel,
}: {
  item: ModelNewsItem;
  isLatest: boolean;
  getModelSpecialties: (model: string) => string[];
  formatHistoryTime: (timestamp: string) => string;
  formatGb: (value: number) => string;
  formatPullCount: (value: number) => string;
  onOpenModel: (model: string) => void;
}) {
  const origin = getModelOrigin(item.displayName);
  const specialties = getModelSpecialties(item.displayName).slice(0, 3);
  const [base, tag] = item.displayName.split(':');

  // The row opens the model, and its name is the button for the keyboard. A
  // "Details" button on every row repeated one outlined word down the list.
  return (
    <li className={isLatest ? 'model-news-item is-new' : 'model-news-item'} onClick={() => onOpenModel(item.displayName)}>
      <div className="model-news-portrait">
        <img src={getModelAvatarSrc(item.displayName)} alt="" />
        {isLatest && <span className="model-news-new">New</span>}
      </div>
      <div className="model-news-copy">
        <div className="model-news-name">
          <button type="button" className="model-news-open" aria-label={`${base}: details`}>
            <strong>{base}</strong>
          </button>
          {tag && <code>{item.displayName}</code>}
        </div>
        <p>{specialties.join(' · ') || item.model.pack}</p>
        <span className="model-news-by">
          {origin.organization !== 'Unknown model family' ? `by ${origin.organization}` : 'maker not recorded'}
          {' · '}seen {formatHistoryTime(item.firstSeenAt)}
          {item.model.pulls != null && <> · <b>{formatPullCount(item.model.pulls)} pulls</b></>}
        </span>
      </div>
      <div className="model-news-meta">
        <span className="figure">{item.model.sizeGb ? formatGb(item.model.sizeGb) : 'Size not listed'}</span>
        <span className="model-news-status">{item.installed ? 'On your PC' : 'Not downloaded'}</span>
      </div>
    </li>
  );
}

function normalizeModelName(model: string | null | undefined) {
  return String(model || '').trim().toLowerCase();
}
