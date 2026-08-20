// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useMemo, type ReactNode } from 'react';
import { Bell, CheckCircle, ChevronRight, RefreshCw, Sparkles } from 'lucide-react';
import type { CatalogModel, ModelRow } from '../types';
import { getModelOrigin } from '../lib/modelOrigins';
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
  renderHeader: (meta: string) => ReactNode;
  renderAvatar: (model: string) => ReactNode;
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
  renderHeader,
  renderAvatar,
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
  const notificationsLabel = notificationsEnabled ? 'Notifications on' : 'Notify me';
  const notificationsDetail = getNotificationDetail(notificationsEnabled, notificationPermission);

  return (
    <section className={active ? 'panel whats-new-panel panel-focused' : 'panel whats-new-panel'} aria-label="What's New panel">
      {renderHeader(latestDrops.length > 0 ? `${latestDrops.length} new` : `${catalog.length} watched`)}

      <div className="whats-new-body">
        <section className="model-news-hero" aria-label="Model drop watcher">
          <div>
            <span>Living Model Radar</span>
            <strong>RigMatch watches the live Ollama catalog for new models</strong>
            <em>No hand-maintained release list. When a scan sees a model RigMatch has not seen before, it lands here.</em>
          </div>
          <div className="model-news-actions">
            <button type="button" className="primary-button compact" onClick={onRefresh} disabled={isScanning}>
              <RefreshCw className={isScanning ? 'spin' : ''} aria-hidden="true" />
              {isScanning ? 'Checking' : 'Check Now'}
            </button>
            <button
              type="button"
              className={notificationsEnabled ? 'mini-button outline subscribed' : 'mini-button outline'}
              onClick={onToggleNotifications}
            >
              {notificationsEnabled ? <CheckCircle aria-hidden="true" /> : <Bell aria-hidden="true" />}
              {notificationsLabel}
            </button>
          </div>
        </section>

        <div className="model-news-stats" aria-label="Model catalog status">
          <div className="utility-stat">
            <span>Latest Drop</span>
            <strong>{latestDrops.length > 0 ? `${latestDrops.length} model${latestDrops.length === 1 ? '' : 's'}` : 'No new drops'}</strong>
            <em>{latestDrops.length > 0 ? 'Found on the latest catalog scan.' : 'RigMatch is caught up with its saved snapshot.'}</em>
          </div>
          <div className="utility-stat">
            <span>Catalog Source</span>
            <strong>{catalogMeta.source}</strong>
            <em>{catalogMeta.error ? `Fallback note: ${catalogMeta.error}` : `${liveCount} live Ollama entries in this scan.`}</em>
          </div>
          <div className="utility-stat">
            <span>Last Checked</span>
            <strong>{lastChecked}</strong>
            <em>{modelNews.knownModelIds.length} known model entries watched locally.</em>
          </div>
          <div className="utility-stat">
            <span>Alerts</span>
            <strong>{notificationsEnabled ? 'Subscribed' : 'Not subscribed'}</strong>
            <em>{notificationsDetail}</em>
          </div>
        </div>

        {latestDrops.length > 0 && (
          <section className="model-news-section latest" aria-label="New model drops">
            <div className="model-news-section-title">
              <Sparkles aria-hidden="true" />
              <div>
                <span>New This Scan</span>
                <strong>Fresh model drops</strong>
              </div>
            </div>
            <ol className="model-news-list">
              {latestDrops.map((item) => (
                <ModelNewsListItem
                  key={item.id}
                  item={item}
                  isLatest={true}
                  renderAvatar={renderAvatar}
                  getModelSpecialties={getModelSpecialties}
                  formatHistoryTime={formatHistoryTime}
                  formatGb={formatGb}
                  formatPullCount={formatPullCount}
                  onOpenModel={onOpenModel}
                />
              ))}
            </ol>
          </section>
        )}

        <section className="model-news-section" aria-label="Latest catalog entries">
          <div className="model-news-section-title">
            <Bell aria-hidden="true" />
            <div>
              <span>Latest Catalog</span>
              <strong>{newsItems.length > 0 ? 'Most recently seen models' : 'Waiting for catalog data'}</strong>
            </div>
          </div>
          {newsItems.length > 0 ? (
            <ol className="model-news-list">
              {newsItems.slice(0, 24).map((item) => (
                <ModelNewsListItem
                  key={item.id}
                  item={item}
                  isLatest={latestNewIds.has(item.id)}
                  renderAvatar={renderAvatar}
                  getModelSpecialties={getModelSpecialties}
                  formatHistoryTime={formatHistoryTime}
                  formatGb={formatGb}
                  formatPullCount={formatPullCount}
                  onOpenModel={onOpenModel}
                />
              ))}
            </ol>
          ) : (
            <div className="utility-empty">
              <strong>No catalog snapshot yet</strong>
              <span>Run a model refresh and RigMatch will seed the watcher from the current Ollama catalog.</span>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function ModelNewsListItem({
  item,
  isLatest,
  renderAvatar,
  getModelSpecialties,
  formatHistoryTime,
  formatGb,
  formatPullCount,
  onOpenModel,
}: {
  item: ModelNewsItem;
  isLatest: boolean;
  renderAvatar: (model: string) => ReactNode;
  getModelSpecialties: (model: string) => string[];
  formatHistoryTime: (timestamp: string) => string;
  formatGb: (value: number) => string;
  formatPullCount: (value: number) => string;
  onOpenModel: (model: string) => void;
}) {
  const origin = getModelOrigin(item.displayName);
  const specialties = getModelSpecialties(item.displayName).slice(0, 3);

  return (
    <li className={isLatest ? 'model-news-item is-new' : 'model-news-item'}>
      {renderAvatar(item.displayName)}
      <div className="model-news-copy">
        <span>
          {isLatest && <b>New</b>}
          {item.installed && <b className="installed">Installed</b>}
          <em>{origin.organization}</em>
        </span>
        <strong>{item.displayName}</strong>
        <p>{specialties.join(' · ') || item.model.pack}</p>
      </div>
      <div className="model-news-meta">
        <span>{item.model.sizeGb ? formatGb(item.model.sizeGb) : 'Size TBA'}</span>
        <em>{item.model.pulls != null ? `${formatPullCount(item.model.pulls)} pulls` : item.model.source}</em>
        <small>Seen {formatHistoryTime(item.firstSeenAt)}</small>
      </div>
      <button type="button" className="mini-button outline" onClick={() => onOpenModel(item.displayName)}>
        Open
        <ChevronRight aria-hidden="true" />
      </button>
    </li>
  );
}

function normalizeModelName(model: string | null | undefined) {
  return String(model || '').trim().toLowerCase();
}
