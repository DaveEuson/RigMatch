// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { isDesktopRuntime } from '../api';
import robotContestantWall from '../assets/robot-contestant-wall.webp';
import type { BenchmarkQuestionCount } from '../benchmarkSuite';
import { formatGb, formatPullCount } from '../lib/format';
/**
 * The date a model arrived, as a date.
 *
 * "3 days ago" was the first attempt, and it needs a clock — which makes it
 * impure in render. The lint rule was right, and chasing it into a useMemo or
 * an effect was solving a problem this column did not need to have: the ask
 * was a date, and a date does not change between renders.
 *
 * Locale-formatted, because the reader is looking for "did I get this before
 * or after that one", not for an ISO string.
 */
function formatInstalledDate(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return 'Unknown';
  return at.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
import type { ListTestResult, ModelQuickFilterId, ModelSortKey, ModelTaskFilterId, SortDirection } from '../lib/modelCatalog';
import { CAPABILITY_ONLY_FILTERS, GENERATION_FILTERS, TASK_FILTER_CHIPS, getBenchmarkForModel, getDiskGuard, getHardwareFit, getModelGoodForTags, getModelProfile, getModelQuickFilters, getModelScore, getModelSearchText, getModelSortLabel, getModelStatusLabel, getPlatformFit, getQueueChipModelName, getSizeRisk, isCloudModel, isEmbeddingModel, isUncensoredModel, isVisiblePullProgress, modelMatchesQuickFilter, modelMatchesTask, sortModelRows } from '../lib/modelCatalog';
import { getModelNewsId } from '../lib/modelNews';
import { getDeveloperFilterOptions, getModelOrigin, getRowDeveloper } from '../lib/modelOrigins';
import type { RunDelta } from '../lib/runHistory';
import type { BenchmarkResult, ModelRow, PullProgressUpdate, RunProgress, TestedModelScore } from '../types';
import { AvatarBust } from './Avatars';
import { DiskGuard } from './DiskGuard';
import { DownloadProgressInline } from './DownloadProgressInline';
import { FirstModelWizard } from './FirstModelWizard';
import { ModelScorePill, ModelStatusPill, PopularityMeter, ScoreLegend } from './ScoreVisuals';
import { SelectedContestantCard } from './SelectedContestantCard';
import { ModelDemoChips } from './SkillDemoViewers';
import { SortableModelHeader } from './SortableModelHeader';
import { ChevronDown, Download, Eraser, Gauge, MessageSquare, Pause, Play, RefreshCw, Search, Settings, ShieldCheck, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export function ModelCabinet({
  active,
  rows,
  comfyFolderSet,
  onOpenComfyHelp,
  onOpenLab,
  goalLens,
  selectedModel,
  installedModelNames,
  shortlistIds,
  queuedModelIds,
  pullProgressByModel,
  modelScores,
  benchmarkByModel,
  diskGuard,
  vramGb,
  platform,
  queuedCount,
  isBenchmarking,
  isPulling,
  isPullCancelRequested,
  isPullPauseRequested,
  isPullPaused,
  isDeletingModel,
  pullingModel,
  shortlistedCount,
  onSelect,
  onScoreModel,
  onDeleteModel,
  onClearScore,
  onQueueModel,
  onPullQueued,
  onPauseQueue,
  onCancelQueue,
  onToggleShortlist,
  onOpenSpeedDate,
  onOpenTopPick,
  onRefresh,
  onChooseModel,
  onOpenModelChat,
  modelNotes,
  onSaveModelNote,
  scoreTrend,
  scoreDeltas,
  newModelIds,
  onQuickCheck,
}: {
  /** Whether a verified ComfyUI models folder exists, so downloads can land. */
  comfyFolderSet: boolean;
  onOpenComfyHelp: () => void;
  /** Generation models are run from the Lab, not from a row's Test button. */
  onOpenLab: () => void;
  /** The task filter implied by the user's primary goal, if any. Applied when
      it changes and freely clearable after — a lens, never a lock. */
  goalLens?: ModelTaskFilterId;
  active: boolean;
  rows: ModelRow[];
  selectedModel: string;
  installedModelNames: Set<string>;
  shortlistIds: Set<string>;
  queuedModelIds: Set<string>;
  pullProgressByModel: Record<string, PullProgressUpdate>;
  modelScores: Record<string, TestedModelScore>;
  benchmarkByModel: Record<string, BenchmarkResult>;
  diskGuard: ReturnType<typeof getDiskGuard>;
  vramGb: number;
  platform: string;
  queuedCount: number;
  isBenchmarking: boolean;
  isListTesting: boolean;
  isPulling: boolean;
  isPullCancelRequested: boolean;
  isPullPauseRequested: boolean;
  isPullPaused: boolean;
  isDeletingModel: boolean;
  pullingModel: string | null;
  listTestResult: ListTestResult | null;
  runProgress: RunProgress | null;
  questionCount: BenchmarkQuestionCount;
  shortlistedCount: number;
  onSelect: (model: string) => void;
  onScoreModel: (row: ModelRow) => void;
  onDeleteModel: (row: ModelRow) => void;
  onClearScore: (model: string) => void;
  onQueueModel: (row: ModelRow) => void;
  onPullQueued: () => void;
  onPauseQueue: () => void;
  onCancelQueue: () => void;
  onToggleShortlist: (row: ModelRow) => void;
  onOpenSuiteEditor: () => void;
  onOpenSpeedDate: () => void;
  onOpenTopPick: () => void;
  onRefresh: () => void;
  onChooseModel: (model: string) => void;
  onOpenModelChat: (model: string) => void;
  modelNotes: Record<string, string>;
  onSaveModelNote: (model: string, note: string) => void;
  scoreTrend: Record<string, number[]>;
  scoreDeltas: Record<string, RunDelta>;
  newModelIds: Set<string>;
  onQuickCheck: (row: ModelRow) => void;
}) {
  const [modelQuery, setModelQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<ModelQuickFilterId>('fits-vram');
  const [taskFilter, setTaskFilter] = useState<ModelTaskFilterId | null>(goalLens ?? null);
  // Re-applied only when the goal itself changes (splash or a future goal
  // editor) — clearing the filter afterwards sticks, so the goal steers
  // without gripping. Adjusted during render rather than in an effect: the
  // rerender happens before children paint, where an effect would flash the
  // unfiltered list first.
  const [appliedLens, setAppliedLens] = useState(goalLens);
  if (goalLens !== appliedLens) {
    setAppliedLens(goalLens);
    if (goalLens) setTaskFilter(goalLens);
  }
  const [developerFilter, setDeveloperFilter] = useState('all');
  const [sortKey, setSortKey] = useState<ModelSortKey>('status');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  // Column widths: Model, Size, Good For, Origin, Status, Match, Popularity (Actions fills remainder)
  // Size fits "Sweet spot", Status fits "Not Installed" (its pill needs ~81px +
  // cell padding), Match fits its header — the previous 62/80/66 defaults
  // ellipsized all three.
  const [colWidths, setColWidths] = useState([156, 92, 126, 86, 110, 76, 96]);
  // Popularity is the least essential column (the local Ollama API exposes no
  // pull counts), so it yields first on narrower windows instead of forcing
  // horizontal scrolling. Handled in JS because the <col> track would keep
  // its width even if the cells were hidden with CSS.
  const [hidePopularity, setHidePopularity] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1600px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1600px)');
    const update = () => setHidePopularity(media.matches);
    media.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  // ollama.com removed public pull counts from its library pages (July 2026), so
  // live scrapes now return pulls: null for every model. When no row has pull
  // data, the Popularity column would be a wall of "No pull data" — repurpose it
  // as a measured-speed column instead. If Ollama ever restores the stats, the
  // column flips back to Popularity automatically.
  const hasAnyPullData = useMemo(() => rows.some((row) => row.pulls != null), [rows]);
  /**
   * "Added" shows only while the Installed filter is on.
   *
   * The date comes from Ollama's modified_at, which only installed models have.
   * Across the whole catalogue that is 16 rows of 322 — a column that is blank
   * 95% of the time, and sortable into a wall of nothing. Under the Installed
   * filter every row has one, which is the only place it is worth the width.
   */
  const showAdded = quickFilter === 'installed';
  const colWidthsRef = useRef(colWidths);
  useEffect(() => {
    colWidthsRef.current = colWidths;
  }, [colWidths]);
  const handleColResizeStart = useCallback((colIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = colWidthsRef.current[colIndex];
    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.max(40, startWidth + ev.clientX - startX);
      setColWidths(prev => { const next = [...prev]; next[colIndex] = newWidth; return next; });
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);
  const selectedRow = rows.find((row) => row.displayName === selectedModel || row.id === selectedModel);
  const selectedProfile = getModelProfile(selectedRow?.displayName ?? selectedModel);
  const selectedScore = selectedRow ? getModelScore(selectedRow, modelScores) : modelScores[selectedModel];
  const selectedQueued = selectedRow ? queuedModelIds.has(selectedRow.displayName) : false;
  const selectedShortlisted = selectedRow ? shortlistIds.has(selectedRow.displayName) : false;
  const selectedInstalled = selectedRow ? installedModelNames.has(selectedRow.displayName) || selectedRow.installed : false;
  const selectedPullProgress = selectedRow ? pullProgressByModel[selectedRow.displayName] : undefined;
  const selectedPulling = Boolean(selectedRow && pullingModel === selectedRow.displayName);
  const query = modelQuery.trim().toLowerCase();
  /**
   * Faceted counts: every chip counts the rows that pass the OTHER active
   * filters, so its number is exactly what clicking it will show.
   *
   * These used to count across the whole catalog regardless of what else was
   * on, which produced chips that promised results and delivered an empty
   * table — "Makes images 3" while the Good fit filter was active, when all three image
   * models were in the too-big-for-this-VRAM bucket.
   */
  const passesQuery = useCallback(
    (row: ModelRow) => !query
      || getModelSearchText(row, queuedModelIds.has(row.displayName), getModelScore(row, modelScores)).includes(query),
    [query, queuedModelIds, modelScores],
  );
  const passesDeveloper = useCallback(
    (row: ModelRow) => developerFilter === 'all' || getRowDeveloper(row).id === developerFilter,
    [developerFilter],
  );
  const passesQuick = useCallback(
    (row: ModelRow) => modelMatchesQuickFilter(row, quickFilter, getModelScore(row, modelScores), vramGb),
    [quickFilter, modelScores, vramGb],
  );
  const passesTask = useCallback(
    (row: ModelRow) => !taskFilter || modelMatchesTask(row, taskFilter),
    [taskFilter],
  );

  const quickFilters = useMemo(
    () => getModelQuickFilters(rows.filter((row) => passesQuery(row) && passesDeveloper(row) && passesTask(row)), modelScores, vramGb),
    [rows, modelScores, vramGb, passesQuery, passesDeveloper, passesTask],
  );
  // Headline "N models look realistic for your VRAM" is about the rig, not the
  // current filter selection, so it stays a whole-catalog figure.
  const vramSafeCount = useMemo(
    () => getModelQuickFilters(rows, modelScores, vramGb).find((filter) => filter.id === 'fits-vram')?.count ?? 0,
    [rows, modelScores, vramGb],
  );
  const taskFilterCounts = useMemo(() => {
    const base = rows.filter((row) => passesQuery(row) && passesDeveloper(row) && passesQuick(row));
    return Object.fromEntries(TASK_FILTER_CHIPS.map((chip) => [chip.id, base.filter((row) => modelMatchesTask(row, chip.id)).length]));
  }, [rows, passesQuery, passesDeveloper, passesQuick]);
  /**
   * Only offer a use case something can actually satisfy.
   *
   * "Makes video" matched nothing at all — not one of the models installed
   * here, none of the 233 in Ollama's library, and nothing in the community
   * namespace. There is no video generation on Ollama to find, so the filter
   * promised a category it could never fill. Deciding this from the catalogue
   * rather than deleting the chip means it comes back on its own the day a
   * video model appears.
   *
   * Counted over every row rather than the filtered ones, so chips do not
   * appear and vanish as a search is typed — and the active chip always stays,
   * or clearing it would be impossible.
   */
  const offerableTaskFilters = useMemo(
    () => TASK_FILTER_CHIPS.filter(
      (chip) => chip.id === taskFilter || rows.some((row) => modelMatchesTask(row, chip.id)),
    ),
    [rows, taskFilter],
  );

  const developerFilterOptions = useMemo(
    () => getDeveloperFilterOptions(rows.filter((row) => passesQuery(row) && passesQuick(row) && passesTask(row))),
    [rows, passesQuery, passesQuick, passesTask],
  );
  const activeDeveloperFilter = developerFilterOptions.some((option) => option.id === developerFilter) ? developerFilter : 'all';
  const shortlistedRows = useMemo(
    () => rows.filter((row) => shortlistIds.has(row.displayName)).slice(0, 5),
    [rows, shortlistIds],
  );
  const speedDateLineupFull = shortlistedRows.length >= 5;
  const queuedRows = useMemo(
    () => rows.filter((row) => queuedModelIds.has(row.displayName)),
    [queuedModelIds, rows],
  );
  const queuedPreviewRows = queuedRows.filter((row) => row.displayName !== pullingModel);
  const queuePreviewLimit = isPulling ? 2 : 3;
  const visibleQueuePreview = queuedPreviewRows.slice(0, queuePreviewLimit);
  const hiddenQueueCount = Math.max(0, queuedPreviewRows.length - visibleQueuePreview.length);
  const queueStatusLabel = isPullCancelRequested
    ? 'Canceling download'
    : isPullPauseRequested
      ? 'Pausing download'
      : isPullPaused
        ? 'Paused'
        : isPulling
          ? 'Downloading now'
          : queuedCount > 0
            ? `${queuedCount} queued · ${formatGb(diskGuard.queuedGb)}`
            : 'No downloads queued';
  const queuePreviewText = visibleQueuePreview.map((row) => row.displayName).join(', ');
  const queueHelperText = isPullCancelRequested
    ? `Stopping ${pullingModel ?? 'the current Ollama pull'} and clearing the queue.`
    : isPullPauseRequested
      ? `Pausing ${pullingModel ?? 'the current model'} and keeping it queued.`
      : isPullPaused
        ? 'Paused downloads stay queued. Start Download resumes through Ollama cached layers when possible.'
        : isPulling
          ? `Pulling ${pullingModel ?? 'the current model'} through Ollama. Pause keeps it queued; Cancel clears the queue.`
          : queuedCount > 0
            ? `Ready to download ${queuePreviewText || 'queued models'}${hiddenQueueCount > 0 ? ` and ${hiddenQueueCount} more` : ''}.`
            : 'Use Get Model on a contestant to stage a download.';
  const visibleRows = useMemo(() => {
    // Same predicates the chip counts use, so a chip can never promise rows the
    // table does not then show.
    const filteredRows = rows.filter(
      (row) => passesQuery(row) && passesDeveloper(row) && passesQuick(row) && passesTask(row),
    );

    return sortModelRows(filteredRows, sortKey, sortDirection, queuedModelIds, modelScores, benchmarkByModel);
  }, [benchmarkByModel, modelScores, passesQuery, passesDeveloper, passesQuick, passesTask, queuedModelIds, rows, sortDirection, sortKey]);
  // Say what each number counts — the catalog total, the installed count, and the
  // VRAM-fit count are different measures and read as contradictory when all three
  // are just "N models".
  const modelCountLabel = query || quickFilter !== 'all' || taskFilter || activeDeveloperFilter !== 'all'
    ? `${visibleRows.length} of ${rows.length} shown`
    : `${rows.length} in catalog`;
  const vramLabel = vramGb > 0 ? `${formatGb(vramGb)} VRAM` : 'detected VRAM';
  const activeQuickFilter = quickFilters.find((filter) => filter.id === quickFilter);
  const activeDeveloperLabel = activeDeveloperFilter === 'all'
    ? null
    : developerFilterOptions.find((option) => option.id === activeDeveloperFilter)?.label ?? activeDeveloperFilter;
  const activeTaskLabel = taskFilter ? TASK_FILTER_CHIPS.find((chip) => chip.id === taskFilter)?.label ?? taskFilter : null;
  const activeFilterSummary = [
    quickFilter !== 'all' ? activeQuickFilter?.label : null,
    activeDeveloperLabel,
    activeTaskLabel,
  ].filter(Boolean).join(' · ');
  const activeFilterCount = [
    quickFilter !== 'all',
    activeDeveloperFilter !== 'all',
    Boolean(taskFilter),
  ].filter(Boolean).length;

  const changeSort = (nextKey: ModelSortKey) => {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === 'name' ? 'asc' : 'desc');
  };

  return (
    <section className={active ? 'panel model-panel panel-focused' : 'panel model-panel'}>
      <header
        className="model-hub-header"
        style={{ backgroundImage: `url(${robotContestantWall})` }}
        aria-label="Models"
      >
        <div className="model-hub-header-copy">
          <h2>Models</h2>
          <em>{vramSafeCount} models look realistic for {vramLabel}. Test one model or run Speed Dating from here.</em>
        </div>
        <div className="model-hub-header-side">
          <span>{modelCountLabel}</span>
          <button type="button" className="mini-button" onClick={onRefresh}>
            <RefreshCw aria-hidden="true" />
            Refresh
          </button>
        </div>
      </header>
      <div className="cabinet-body">
      <div className="cabinet-main">
      {installedModelNames.size === 0 && isDesktopRuntime && (
        <FirstModelWizard vramGb={vramGb} onQueueModel={(modelId) => {
          const row = rows.find((r) => r.id === modelId || r.displayName === modelId);
          if (row) onQueueModel(row);
        }} />
      )}
      <div className="model-tools">
        <label className="model-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Search models</span>
          <input
            type="search"
            value={modelQuery}
            onChange={(event) => setModelQuery(event.target.value)}
            placeholder="Search models by name, strength, size, or status..."
            aria-label="Search models"
          />
          {modelQuery && (
            <button type="button" onClick={() => setModelQuery('')} aria-label="Clear model search">
              <X aria-hidden="true" />
            </button>
          )}
        </label>
        <span className="model-sort-status advanced-only">
          Sort: {getModelSortLabel(sortKey)} / {sortDirection === 'asc' ? 'Asc' : 'Desc'}
        </span>
        <details className="model-filter-menu">
          <summary aria-label="Open model filters">
            <SlidersHorizontal aria-hidden="true" />
            <span>Filters</span>
            <em>{activeFilterCount > 0 ? `${activeFilterCount} active` : 'Default'}</em>
            <ChevronDown aria-hidden="true" />
          </summary>
          <div className="model-filter-tray">
            <div className="model-filter-tray-head">
              <span>{activeFilterSummary || 'All model filters are available here.'}</span>
              <button
                type="button"
                className="model-filter-reset"
                onClick={() => {
                  setQuickFilter('all');
                  setDeveloperFilter('all');
                  setTaskFilter(null);
                }}
                disabled={activeFilterCount === 0}
              >
                Reset
              </button>
            </div>
            <div className="model-quick-filters" aria-label="Model quick filters">
              {quickFilters.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={quickFilter === filter.id ? 'active' : ''}
                  onClick={() => setQuickFilter(filter.id)}
                  aria-pressed={quickFilter === filter.id}
                >
                  <span>{filter.label}</span>
                  <em>{filter.count}</em>
                </button>
              ))}
            </div>
            <div className="model-task-filters model-developer-filters" aria-label="Filter by developer">
              <span className="model-task-filters-label">By:</span>
              <button
                type="button"
                className={activeDeveloperFilter === 'all' ? 'active' : ''}
                onClick={() => setDeveloperFilter('all')}
                aria-pressed={activeDeveloperFilter === 'all' ? 'true' : 'false'}
              >
                All
                <em>{rows.length}</em>
              </button>
              {developerFilterOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={activeDeveloperFilter === option.id ? 'active' : ''}
                  onClick={() => setDeveloperFilter(activeDeveloperFilter === option.id ? 'all' : option.id)}
                  aria-pressed={activeDeveloperFilter === option.id ? 'true' : 'false'}
                  title={`Show models by ${option.label}`}
                >
                  {option.label}
                  <em>{option.count}</em>
                </button>
              ))}
            </div>
            <div className="model-task-filters advanced-only" aria-label="Filter by use case">
              <span className="model-task-filters-label">For:</span>
              {offerableTaskFilters.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={taskFilter === chip.id ? 'active' : ''}
                  onClick={() => setTaskFilter(taskFilter === chip.id ? null : chip.id)}
                  aria-pressed={taskFilter === chip.id ? 'true' : 'false'}
                >
                  {chip.label}
                  <em>{taskFilterCounts[chip.id] ?? 0}</em>
                </button>
              ))}
            </div>
            {quickFilter === 'fits-vram' && (
              <div className="model-filter-note">
                <ShieldCheck aria-hidden="true" />
                <span>Showing {vramSafeCount} models that fit {vramLabel}, including close fits. Models too big for your VRAM stay hidden unless you show all.</span>
                <button type="button" onClick={() => setQuickFilter('all')}>Show all</button>
              </div>
            )}
            {GENERATION_FILTERS.includes(taskFilter as string) && !comfyFolderSet && (
              <div className="model-filter-note">
                <ShieldCheck aria-hidden="true" />
                {/* Shown where the Download buttons are, not buried in
                    Settings: this is the moment someone finds out these models
                    need something they may not have. */}
                <span>
                  These run on ComfyUI, a separate free program RigMatch does not install.
                  Once it is running, point RigMatch at its folder in Settings and these become
                  one-click downloads.
                </span>
                <button type="button" onClick={() => void onOpenComfyHelp()}>What is ComfyUI?</button>
              </div>
            )}
            {CAPABILITY_ONLY_FILTERS.includes(taskFilter as string) && (
              <div className="model-filter-note">
                <ShieldCheck aria-hidden="true" />
                {/* Now counts the library's own listing as well as installed
                    models, but that listing returns only its top twenty per
                    capability — /search does not paginate. So the number is
                    still a floor, just a far less misleading one than
                    "whatever I happen to have downloaded". */}
                <span>
                  Counts what your provider confirms plus what the Ollama library
                  lists, which is its top twenty for this skill. Others may have it
                  and not be listed — installing one always settles it.
                </span>
              </div>
            )}
          </div>
        </details>
      </div>
      <ScoreLegend />
      {shortlistedCount >= 5 && (
        <div className="lineup-full-banner" role="status">
          <span>⚡ Speed Dating lineup is full — 5/5 contestants selected. Remove one to swap in another.</span>
        </div>
      )}
      <div className="table-wrap model-table">
        <table>
          <colgroup>
            {colWidths.map((w, i) => (hidePopularity && i === 6 ? null : <col key={i} style={{ width: w }} />))}
            {showAdded && <col style={{ width: 104 }} />}
            <col />
          </colgroup>
          <thead>
            <tr>
              <SortableModelHeader label="Model" sortName="name" sortKey={sortKey} direction={sortDirection} onSort={changeSort} onResizeStart={(e) => handleColResizeStart(0, e)} />
              <SortableModelHeader label="Size" sortName="size" sortKey={sortKey} direction={sortDirection} onSort={changeSort} onResizeStart={(e) => handleColResizeStart(1, e)} />
              <SortableModelHeader label="Good For" sortName="skill" sortKey={sortKey} direction={sortDirection} onSort={changeSort} onResizeStart={(e) => handleColResizeStart(2, e)} />
              <SortableModelHeader label="By" sortName="origin" sortKey={sortKey} direction={sortDirection} onSort={changeSort} onResizeStart={(e) => handleColResizeStart(3, e)} />
              <SortableModelHeader label="Status" sortName="status" sortKey={sortKey} direction={sortDirection} onSort={changeSort} onResizeStart={(e) => handleColResizeStart(4, e)} />
              <SortableModelHeader label="Match" sortName="score" sortKey={sortKey} direction={sortDirection} onSort={changeSort} onResizeStart={(e) => handleColResizeStart(5, e)} />
              {!hidePopularity && (
                <SortableModelHeader
                  label={hasAnyPullData ? 'Popularity' : 'Speed'}
                  sortName={hasAnyPullData ? 'pulls' : 'speed'}
                  sortKey={sortKey}
                  direction={sortDirection}
                  onSort={changeSort}
                  onResizeStart={(e) => handleColResizeStart(6, e)}
                />
              )}
              {showAdded && (
                <SortableModelHeader
                  label="Added"
                  sortName="added"
                  sortKey={sortKey}
                  direction={sortDirection}
                  onSort={changeSort}
                />
              )}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const selected = selectedModel === row.displayName || selectedModel === row.id;
              const installed = installedModelNames.has(row.displayName) || row.installed;
              const queued = queuedModelIds.has(row.displayName);
              const rowPullProgress = pullProgressByModel[row.displayName];
              const isPullingRow = pullingModel === row.displayName;
              const shortlisted = shortlistIds.has(row.displayName);
              const origin = getModelOrigin(row.displayName);
              const sizeRisk = getSizeRisk(row.sizeGb);
              const statusLabel = getModelStatusLabel(row, queued);
              const score = getModelScore(row, modelScores);
              // Look up with the normalized-key helper: benchmarkByModel is keyed
              // by normalizeModelKey, so a raw displayName misses on any non-lowercase name.
              const rowBenchmark = getBenchmarkForModel(benchmarkByModel, row.displayName, row);
              const isNewModel = newModelIds.has(getModelNewsId(row));
              const goodForTags = getModelGoodForTags(row);
              const hardwareFit = getHardwareFit(row, vramGb);
              const platformFit = getPlatformFit(row.displayName, platform);
              const speedDateLineupFullForRow = shortlistedCount >= 5;
              const canJoinSpeedDate = platformFit.compatible && hardwareFit.recommend;
              const canChangeSpeedDateSlot = canJoinSpeedDate && (shortlisted || !speedDateLineupFullForRow);
              const speedDateSlotLabel = shortlisted
                ? 'Selected'
                : !platformFit.compatible
                  ? 'OS Only'
                  : !hardwareFit.recommend
                  // Unknown-size models aren't "too big" — we just can't verify the
                  // footprint yet. Say so instead of falsely calling them too big.
                  ? (hardwareFit.tone === 'unknown' ? 'Size unknown' : 'Too Big')
                  : speedDateLineupFullForRow
                    ? '+ Speed Date'
                    : 'Add to Speed Dating';
              const speedDateSlotTitle = !platformFit.compatible
                ? platformFit.reason
                : !hardwareFit.recommend
                ? hardwareFit.detail
                : shortlisted
                  ? installed
                    ? `Remove ${row.displayName} from Speed Dating`
                    : `In lineup — download ${row.displayName} before running the test. Click to remove.`
                  : speedDateLineupFullForRow
                    ? 'Speed Dating lineup is full. Remove one contestant from the lineup first.'
                    : installed
                      ? `Add ${row.displayName} to Speed Dating`
                      : `Add ${row.displayName} to lineup — download it before starting the test`;
              const speedDateSlotAriaLabel = shortlisted
                ? `Remove ${row.displayName} from Speed Dating`
                : canJoinSpeedDate
                  ? `Add ${row.displayName} to Speed Dating`
                  : !platformFit.compatible
                    ? `${row.displayName} is not available for Speed Dating on this operating system`
                    : `${row.displayName} is too large for Speed Dating on this computer`;
              const rowClassName = [
                selected ? 'selected' : '',
                hardwareFit.tone === 'out-of-league' ? 'out-of-league' : '',
              ].filter(Boolean).join(' ');
              const showDownloadProgress = !installed && (queued || isPullingRow || isVisiblePullProgress(rowPullProgress));
              return (
                <tr
                  key={row.id}
                  className={rowClassName}
                  onDoubleClick={() => { onSelect(row.displayName); onOpenTopPick(); }}
                  title="Double-click to open profile"
                >
                  <td>
                    <button type="button" className="model-name-button" onClick={() => onSelect(row.displayName)}>
                      <AvatarBust generationKind={row.generationKind} model={row.displayName} size="tiny" />
                      <span>
                        {row.displayName}
                        {isNewModel && <em className="model-new-sub">New</em>}
                        {row.params && <em className="model-params-sub">{row.params}</em>}
                        {row.installedModel?.quantization && (
                          <em
                            className="model-quant-sub"
                            title={`Quantization ${row.installedModel.quantization}. A different quantization of the same model is a different contestant — different quality, VRAM and speed.`}
                          >
                            {row.installedModel.quantization}
                          </em>
                        )}
                        {row.runtime === 'comfyui'
                          ? <em className="model-provider-sub comfy">ComfyUI</em>
                          : row.localProviderLabel && <em className="model-provider-sub">{row.localProviderLabel}</em>}
                        {row.pulls != null && (
                          <em className="model-pulls-sub" title={`${row.pulls.toLocaleString()} pulls on Ollama`}>{formatPullCount(row.pulls)} pulls</em>
                        )}
                      </span>
                    </button>
                    {isCloudModel(row.displayName) && (
                      <span className="model-warning-tag" title="This model runs on remote servers — prompts leave your computer">☁ Cloud</span>
                    )}
                    {isEmbeddingModel(row.displayName) && (
                      <span className="model-warning-tag" title="Embedding model — not for chat or text generation">Embed only</span>
                    )}
                    {!platformFit.compatible && (
                      <span className="platform-tag" title={platformFit.reason}>macOS only</span>
                    )}
                  </td>
                  <td title={platformFit.compatible ? `${sizeRisk.message} ${hardwareFit.detail}` : platformFit.reason}>
                    <div className="size-fit-cell">
                      <span className={`size-pill ${sizeRisk.tone}`}>
                        {row.sizeGb ? `${row.sizeGb} GB` : '?'}
                      </span>
                      {platformFit.compatible
                        // Strip the "· X GB" suffix — the size pill above already
                        // shows it, and the duplicate forced an ellipsis.
                        ? <span className={`fit-pill ${hardwareFit.tone}`}>{hardwareFit.label.replace(/\s*·.*$/, '')}</span>
                        : <span className="fit-pill out-of-league">macOS Only</span>
                      }
                    </div>
                  </td>
                  <td className="good-for-cell" title={goodForTags.join(', ')}>
                    <div className="good-for-tags">
                      {goodForTags.map((tag) => (
                        <span key={tag} className="good-for-chip">{tag}</span>
                      ))}
                    </div>
                    {isUncensoredModel(row.displayName) && (
                      <span className="uncensored-badge" title="Uncensored / unrestricted model">unrestricted</span>
                    )}
                  </td>
                  <td title={`${row.publisher ?? origin.organization} · ${origin.country}`}>
                    <span className={`origin-pill origin-${origin.family}`}>{row.publisher ?? origin.organization}</span>
                  </td>
                  <td>
                    <ModelStatusPill installed={installed} queued={queued} label={statusLabel} />
                  </td>
                  <td>
                    <ModelScorePill score={score} />
                  </td>
                  {!hidePopularity && (
                    <td className="speed-cell">
                      <div className="speed-pop-cell">
                        {rowBenchmark?.avgTokensPerSecond != null && (
                          <span className="speed-pill tested">{Math.round(rowBenchmark.avgTokensPerSecond)} tok/s</span>
                        )}
                        {hasAnyPullData ? (
                          <PopularityMeter pulls={row.pulls} />
                        ) : rowBenchmark?.avgTokensPerSecond == null && (
                          <span className="speed-untested" title="Run a test to measure this model's speed on this computer">Not tested</span>
                        )}
                      </div>
                    </td>
                  )}
                  {showAdded && (
                    <td className="added-cell">
                      {row.installedModel?.modifiedAt ? (
                        <span title={new Date(row.installedModel.modifiedAt).toLocaleString()}>
                          {formatInstalledDate(row.installedModel.modifiedAt)}
                        </span>
                      ) : (
                        // Reachable: a model installed through something other
                        // than Ollama, or an Ollama too old to report it.
                        <span className="speed-untested">Unknown</span>
                      )}
                    </td>
                  )}
                  <td className={showDownloadProgress ? 'action-cell has-download-progress' : 'action-cell'}>
                    <div className="row-actions">
                      {/* A checkpoint has no chat endpoint, no Ollama entry and
                          no Match score. Offering Test, Chat, Speed Dating or
                          "delete from Ollama" on one is offering four buttons
                          that cannot work — the Lab is where these are run. */}
                      {row.runtime === 'comfyui' ? (
                        <>
                          {row.installed ? (
                            <button
                              type="button"
                              className="mini-button"
                              onClick={() => onOpenLab()}
                              title={`Try ${row.displayName} in the ${row.generationKind === 'video' ? 'Video' : 'Image'} Lab`}
                            >
                              <Play aria-hidden="true" />
                              <span>Open Lab</span>
                            </button>
                          ) : (
                            /* Without a ComfyUI folder there is nowhere to put
                               the file, so Download cannot work — and it used to
                               be offered anyway, queue silently, and sit at
                               "Queued" forever. Send people to the setting that
                               unblocks it instead of to a dead end. The existing
                               guidance about this lived only under the
                               imagegen/videogen filters, so anyone who found the
                               row by searching never saw it. */
                            !comfyFolderSet ? (
                              <button
                                type="button"
                                className="mini-button"
                                onClick={() => void onOpenComfyHelp()}
                                title={`${row.displayName} installs into ComfyUI. RigMatch needs to know where ComfyUI is before it can download anything.`}
                              >
                                <Settings aria-hidden="true" />
                                <span>Set up ComfyUI</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="mini-button"
                                onClick={() => onQueueModel(row)}
                                title={`Queue ${row.displayName} — ${row.sizeGb} GB into ComfyUI`}
                              >
                                <Download aria-hidden="true" />
                                <span>{queued ? 'Queued' : 'Download'}</span>
                              </button>
                            )
                          )}
                        </>
                      ) : (
                        <>
                      <button
                        type="button"
                        className={shortlisted ? 'slot-button speed-date-row-button active' : 'slot-button speed-date-row-button'}
                        onClick={() => onToggleShortlist(row)}
                        disabled={!canChangeSpeedDateSlot}
                        title={speedDateSlotTitle}
                        aria-label={speedDateSlotAriaLabel}
                      >
                        <span>{speedDateSlotLabel}</span>
                      </button>
                      {installed ? (
                        <>
                          {/* "Pick as top model" lives in the detail panel, not on every
                              row — seven repeated bright buttons out-shouted the actual
                              primary actions while being the least-used one. */}
                          <button
                            type="button"
                            className={`mini-button score-row-button${!hardwareFit.recommend ? ' warn' : ''}`}
                            onClick={() => onScoreModel(row)}
                            disabled={isBenchmarking}
                            title={hardwareFit.recommend ? `Test ${row.displayName} on this computer` : hardwareFit.tone === 'unknown' ? `⚠ Size unknown — RigMatch can't gauge fit yet, test anyway?` : `⚠ Too big for your VRAM — will be slow, test anyway?`}
                          >
                            <Gauge aria-hidden="true" />
                            Test
                          </button>
                          <button
                            type="button"
                            className="icon-action chat-model-button"
                            onClick={() => onOpenModelChat(row.displayName)}
                            title={`Chat with ${row.displayName}`}
                            aria-label={`Chat with ${row.displayName}`}
                          >
                            <MessageSquare aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="icon-action delete-model-button"
                            onClick={() => onDeleteModel(row)}
                            disabled={isBenchmarking || isDeletingModel || row.localProvider === 'lm-studio'}
                            title={row.localProvider === 'lm-studio' ? 'Manage LM Studio models in LM Studio' : `Delete ${row.displayName} from Ollama`}
                            aria-label={row.localProvider === 'lm-studio' ? `${row.displayName} is managed in LM Studio` : `Delete ${row.displayName} from Ollama`}
                          >
                            <Trash2 aria-hidden="true" />
                          </button>
                          {score && (
                            <button
                              type="button"
                              className="icon-action score-clear-button"
                              onClick={() => onClearScore(row.displayName)}
                              title={`Clear ${row.displayName}'s saved score — the model stays installed`}
                              aria-label={`Clear ${row.displayName}'s saved score`}
                            >
                              <Eraser aria-hidden="true" />
                            </button>
                          )}
                          <ModelDemoChips model={row.displayName} label="" className="inline" />
                        </>
                      ) : (
                        <button
                          type="button"
                          className={queued ? 'mini-button queued download-row-button' : `mini-button outline download-row-button${!hardwareFit.recommend ? ' warn' : ''}`}
                          onClick={() => onQueueModel(row)}
                          disabled={!queued && !platformFit.compatible}
                          title={!platformFit.compatible ? platformFit.reason : !hardwareFit.recommend ? (hardwareFit.tone === 'unknown' ? `Size unknown — download to find out the footprint?` : `⚠ Too big for your VRAM — download anyway?`) : `${queued ? 'Remove from queue' : `Get ${row.displayName}`}: ${row.sizeGb ? formatGb(row.sizeGb) : 'unknown size'}`}
                          aria-label={!platformFit.compatible ? platformFit.reason : queued ? `Remove ${row.displayName} from the download queue` : `Get ${row.displayName}`}
                        >
                          <span>{!platformFit.compatible ? 'macOS Only' : queued ? 'Remove' : `Get ${getQueueChipModelName(row.displayName)}`}</span>
                        </button>
                      )}
                        </>
                      )}
                    </div>
                    {showDownloadProgress && (
                      <DownloadProgressInline
                        model={row.displayName}
                        queued={queued}
                        isActive={isPullingRow}
                        isStopping={isPullCancelRequested && isPullingRow}
                        progress={rowPullProgress}
                        onCancel={() => (isPullingRow ? onCancelQueue() : onQueueModel(row))}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr className="empty-row">
                <td colSpan={(hidePopularity ? 7 : 8) + (showAdded ? 1 : 0)}>
                  <div className="table-empty-state">
                    <strong>No contestants match these filters</strong>
                    <span>Clear the search or show the full model pool.</span>
                    <button
                      type="button"
                      className="mini-button outline"
                      onClick={() => {
                        setModelQuery('');
                        setQuickFilter('all');
                      }}
                    >
                      Show All
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="model-footer">
        <DiskGuard guard={diskGuard} />
        <div className="pull-queue" aria-live="polite">
          <div className="queue-status-copy">
            <span>Download Queue</span>
            <strong>{queueStatusLabel}</strong>
            <em>{queueHelperText}</em>
          </div>
          <div className="queue-chip-list" aria-label="Queued downloads">
            {isPulling && pullingModel && (
              <span
                className={isPullCancelRequested ? 'queue-chip stopping' : isPullPauseRequested ? 'queue-chip paused' : 'queue-chip active'}
                title={pullingModel}
              >
                <RefreshCw aria-hidden="true" />
                {getQueueChipModelName(pullingModel)}
              </span>
            )}
            {visibleQueuePreview.map((row) => (
              <span key={row.displayName} className="queue-chip" title={row.displayName}>
                {getQueueChipModelName(row.displayName)}
              </span>
            ))}
            {hiddenQueueCount > 0 && (
              <span className="queue-chip muted">+{hiddenQueueCount} more</span>
            )}
            {queuedCount === 0 && !isPulling && (
              <span className="queue-chip muted">Empty</span>
            )}
          </div>
          <div className="queue-actions">
            <button
              type="button"
              className={queuedCount > 0 || isPulling ? 'primary-button compact' : 'mini-button outline'}
              onClick={onPullQueued}
              disabled={queuedCount === 0 || isPulling}
            >
              <Download aria-hidden="true" />
              {isPulling ? 'Downloading' : isPullPaused ? 'Resume Download' : queuedCount > 0 ? 'Start Download' : 'Download'}
            </button>
            {isPulling && (
              <button
                type="button"
                className="mini-button outline queue-pause-button"
                onClick={onPauseQueue}
                disabled={isPullPauseRequested || isPullCancelRequested}
                title="Pause the active Ollama pull and keep it in the queue"
              >
                <Pause aria-hidden="true" />
                {isPullPauseRequested ? 'Pausing' : 'Pause'}
              </button>
            )}
            {(queuedCount > 0 || isPulling) && (
              <button
                type="button"
                className="mini-button outline queue-cancel-button"
                onClick={onCancelQueue}
                disabled={isPullCancelRequested}
                title={isPulling ? 'Cancel the active Ollama pull and clear queued downloads' : 'Cancel all queued downloads'}
              >
                <X aria-hidden="true" />
                {isPullCancelRequested ? 'Canceling' : isPulling ? 'Cancel Queue' : 'Cancel Queue'}
              </button>
            )}
          </div>
        </div>
      </div>
      </div>
      <div className="cabinet-sidebar">
        <SelectedContestantCard
          row={selectedRow}
          profile={selectedProfile}
          score={selectedScore}
          vramGb={vramGb}
          installed={selectedInstalled}
          queued={selectedQueued}
          shortlisted={selectedShortlisted}
          speedDateLineupFull={speedDateLineupFull}
          pullProgress={selectedPullProgress}
          isPulling={selectedPulling}
          isPullStopping={Boolean(isPullCancelRequested && selectedPulling)}
          isBenchmarking={isBenchmarking}
          onChooseModel={onChooseModel}
          onScoreModel={onScoreModel}
          onQueueModel={onQueueModel}
          onCancelQueue={onCancelQueue}
          onToggleShortlist={onToggleShortlist}
          onOpenSpeedDate={onOpenSpeedDate}
          modelNotes={modelNotes}
          onSaveModelNote={onSaveModelNote}
          scoreTrend={scoreTrend}
          scoreDeltas={scoreDeltas}
          onQuickCheck={onQuickCheck}
        />
      </div>
      </div>
    </section>
  );
}
