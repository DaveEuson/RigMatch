// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useMemo, useRef, useState } from 'react';
import type { CatalogModel, ModelRow } from '../types';
import type { ModelGroup } from '../lib/modelGroups';
import { getModelOrigin } from '../lib/modelOrigins';
import { getModelAvatarSrc } from '../lib/modelAvatars';
import {
  getModelNewsItems,
  getModelNewsPage,
  getNotificationDetail,
  groupModelNews,
  type ModelNewsItem,
  type ModelNewsState,
  type ModelNotificationPermission,
} from '../lib/modelNews';

type NewsView = { scope: 'new' | 'recent'; page: number };

// Where the reader was, kept for the rest of the session. Opening a model
// leaves this screen, which unmounts it, and coming back to page 1 of a list
// they were paging through meant finding their place again.
let savedView: NewsView | null = null;

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
  // Recently seen was cut at 24 when there was one page; the catalog RigMatch
  // watches is a few hundred tags, so all of it pages now.
  const [view, setView] = useState<NewsView>(() => savedView ?? { scope: latestDrops.length > 0 ? 'new' : 'recent', page: 1 });
  const changeView = (next: NewsView) => {
    savedView = next;
    setView(next);
  };
  const { scope } = view;
  // The tabs count rows, as the pager does: a family is one model.
  const newRows = groupModelNews(latestDrops);
  const recentRows = groupModelNews(newsItems);
  const { entries: shown, page, pageCount, total, first, last } = getModelNewsPage(
    scope === 'new' ? newRows : recentRows,
    view.page,
  );
  const [openFamilies, setOpenFamilies] = useState<Set<string>>(() => new Set());
  const toggleFamily = (family: string) => setOpenFamilies((current) => {
    const next = new Set(current);
    if (next.has(family)) next.delete(family);
    else next.add(family);
    return next;
  });
  const tabsRef = useRef<HTMLDivElement>(null);
  const turnPage = (to: number) => {
    changeView({ scope, page: to });
    bringIntoViewFromAbove(tabsRef.current);
  };

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

      <div className="screen-tabs news-tabs" role="group" aria-label="Which models" ref={tabsRef}>
        <button type="button" aria-pressed={scope === 'new'} onClick={() => changeView({ scope: 'new', page: 1 })}>
          New this scan <span className="news-count">{newRows.length}</span>
        </button>
        <button type="button" aria-pressed={scope === 'recent'} onClick={() => changeView({ scope: 'recent', page: 1 })}>
          Recently seen <span className="news-count">{recentRows.length}</span>
        </button>
        <span className="news-tabs-note">
          {catalog.length} watched · {liveCount} live in this scan · {notificationsEnabled ? 'notifications on' : 'notifications off'}
        </span>
      </div>

      {shown.length > 0 ? (
        <>
          <ol className="model-news-list">
            {shown.flatMap((entry) => {
              const renderItem = (item: ModelNewsItem, asVersion = false) => (
                <ModelNewsListItem
                  key={item.id}
                  item={item}
                  isLatest={latestNewIds.has(item.id)}
                  asVersion={asVersion}
                  getModelSpecialties={getModelSpecialties}
                  formatHistoryTime={formatHistoryTime}
                  formatGb={formatGb}
                  formatPullCount={formatPullCount}
                  onOpenModel={onOpenModel}
                />
              );
              if (entry.kind === 'row') return [renderItem(entry.row)];
              const open = openFamilies.has(entry.group.family);
              return [
                <ModelNewsFamilyItem
                  key={`family:${entry.group.family}`}
                  group={entry.group}
                  open={open}
                  hasLatest={entry.group.rows.some((item) => latestNewIds.has(item.id))}
                  getModelSpecialties={getModelSpecialties}
                  formatHistoryTime={formatHistoryTime}
                  formatGb={formatGb}
                  formatPullCount={formatPullCount}
                  onToggle={() => toggleFamily(entry.group.family)}
                />,
                ...(open ? entry.group.rows.map((item) => renderItem(item, true)) : []),
              ];
            })}
          </ol>
          {pageCount > 1 && (
            <nav className="news-pager" aria-label="What's New pages">
              <span>Showing {first}–{last} of {total} models</span>
              {/* aria-disabled, not disabled: a disabled button drops focus to
                  the page, so pressing Next onto the last page lost your place
                  in the tab order. */}
              <div className="news-pager-steps">
                <button type="button" className="btn btn-line" aria-disabled={page <= 1} onClick={() => page > 1 && turnPage(page - 1)}>
                  Previous
                </button>
                <span className="news-pager-page" aria-live="polite">Page {page} of {pageCount}</span>
                <button type="button" className="btn btn-line" aria-disabled={page >= pageCount} onClick={() => page < pageCount && turnPage(page + 1)}>
                  Next
                </button>
              </div>
            </nav>
          )}
        </>
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
  asVersion,
  getModelSpecialties,
  formatHistoryTime,
  formatGb,
  formatPullCount,
  onOpenModel,
}: {
  item: ModelNewsItem;
  isLatest: boolean;
  /** Listed under its open family row, which already shows the face, uses and maker. */
  asVersion: boolean;
  getModelSpecialties: (model: string) => string[];
  formatHistoryTime: (timestamp: string) => string;
  formatGb: (value: number) => string;
  formatPullCount: (value: number) => string;
  onOpenModel: (model: string) => void;
}) {
  const origin = getModelOrigin(item.displayName);
  const specialties = getModelSpecialties(item.displayName).slice(0, 3);
  const [base, tag] = item.displayName.split(':');
  const className = ['model-news-item', isLatest && 'is-new', asVersion && 'is-version'].filter(Boolean).join(' ');

  // The row opens the model, and its name is the button for the keyboard. A
  // "Details" button on every row repeated one outlined word down the list.
  if (asVersion) {
    return (
      <li className={className} onClick={() => onOpenModel(item.displayName)}>
        <div className="model-news-portrait" />
        <div className="model-news-copy">
          <div className="model-news-name">
            <button type="button" className="model-news-open" aria-label={`${item.displayName}: details`}>
              <code>{item.displayName}</code>
            </button>
          </div>
          <span className="model-news-by">seen {formatHistoryTime(item.firstSeenAt)}</span>
        </div>
        <div className="model-news-meta">
          <span className="figure">{item.model.sizeGb ? formatGb(item.model.sizeGb) : 'Size not listed'}</span>
          <span className="model-news-status">{item.installed ? 'On your PC' : 'Not downloaded'}</span>
        </div>
      </li>
    );
  }

  return (
    <li className={className} onClick={() => onOpenModel(item.displayName)}>
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

// A family's tags share a maker, uses and pull count, so the row shows them
// once, from its newest tag, and the toggle lists the tags under it. The whole
// row opens it, as on Models; the toggle is the keyboard's way in.
function ModelNewsFamilyItem({
  group,
  open,
  hasLatest,
  getModelSpecialties,
  formatHistoryTime,
  formatGb,
  formatPullCount,
  onToggle,
}: {
  group: ModelGroup<ModelNewsItem>;
  open: boolean;
  hasLatest: boolean;
  getModelSpecialties: (model: string) => string[];
  formatHistoryTime: (timestamp: string) => string;
  formatGb: (value: number) => string;
  formatPullCount: (value: number) => string;
  onToggle: () => void;
}) {
  const { family, rows: versions, best } = group;
  const origin = getModelOrigin(best.displayName);
  const specialties = getModelSpecialties(best.displayName).slice(0, 3);
  const sizes = versions.map((item) => item.model.sizeGb).filter((gb): gb is number => gb != null && gb > 0);
  const smallest = sizes.length ? Math.min(...sizes) : null;
  const largest = sizes.length ? Math.max(...sizes) : null;
  const installedCount = versions.filter((item) => item.installed).length;
  const versionCount = `${versions.length} versions`;

  return (
    <li className={hasLatest ? 'model-news-item is-new' : 'model-news-item'} onClick={onToggle}>
      <div className="model-news-portrait">
        <img src={getModelAvatarSrc(best.displayName)} alt="" />
        {hasLatest && <span className="model-news-new">New</span>}
      </div>
      <div className="model-news-copy">
        <div className="model-news-name">
          <strong>{family}</strong>
          <button
            type="button"
            className="model-family-toggle"
            aria-expanded={open}
            aria-label={open ? `Hide ${versionCount} of ${family}` : `${versionCount} of ${family}`}
          >
            {open ? 'Hide' : versionCount}
          </button>
        </div>
        <p>{specialties.join(' · ') || best.model.pack}</p>
        <span className="model-news-by">
          {origin.organization !== 'Unknown model family' ? `by ${origin.organization}` : 'maker not recorded'}
          {' · '}seen {formatHistoryTime(best.firstSeenAt)}
          {best.model.pulls != null && <> · <b>{formatPullCount(best.model.pulls)} pulls</b></>}
        </span>
      </div>
      <div className="model-news-meta">
        <span className="figure">
          {smallest == null || largest == null
            ? 'Size not listed'
            : smallest === largest ? formatGb(smallest) : `${formatGb(smallest)} – ${formatGb(largest)}`}
        </span>
        <span className="model-news-status">{installedCount > 0 ? `${installedCount} on your PC` : 'Not downloaded'}</span>
      </div>
    </li>
  );
}

// Scrolls the one box that scrolls, and only when the anchor is above its
// top: scrollIntoView also scrolls every ancestor and pushed the top bar off
// the window (see LanBrowser).
function bringIntoViewFromAbove(anchor: HTMLElement | null) {
  if (!anchor) return;
  let scroller = document.scrollingElement as HTMLElement | null;
  for (let node = anchor.parentElement; node; node = node.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) { scroller = node; break; }
  }
  if (!scroller) return;
  const top = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top;
  const offset = anchor.getBoundingClientRect().top - top;
  if (offset < 0) scroller.scrollBy({ top: offset - 16 });
}

function normalizeModelName(model: string | null | undefined) {
  return String(model || '').trim().toLowerCase();
}
