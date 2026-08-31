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
import { CAPABILITY_ONLY_FILTERS, GENERATION_FILTERS, TASK_FILTER_CHIPS, getBenchmarkForModel, getDiskGuard, getFriendlyModelName, getHardwareFit, getModelGoodForTags, getModelProfile, getModelQuickFilters, getModelScore, getModelSearchText, getModelSortLabel, getModelStatusLabel, getPlatformFit, getQueueChipModelName, getSizeRisk, isCloudModel, isEmbeddingModel, isUncensoredModel, isVisiblePullProgress, modelMatchesQuickFilter, modelMatchesTask, sortModelRows } from '../lib/modelCatalog';
import { buildQuickFacetGroups, buildSearchSuggestions, splitTaskFilters } from '../lib/modelFacets';
import type { SearchSuggestion } from '../lib/modelFacets';
import { familiesToAutoExpand, groupRowsByFamily } from '../lib/modelGroups';
import { describeModelTag } from '../lib/modelVariants';
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
import { Check, ChevronRight, Download, Eraser, Gauge, MessageSquare, Pause, Play, RefreshCw, Search, Settings, ShieldCheck, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * One row of the filter rail: name, tick, and the count it would leave you with.
 *
 * The tick is a tick and not a radio dot even though only one option per group
 * can be on at a time, because what the reader needs from it is "is this on",
 * and clicking an on one turns it off — which is checkbox behaviour, not radio
 * behaviour. The count is the point of the whole rail: it is the answer to
 * "what does this cost me" before you spend the click.
 */
function FacetButton({ label, count, active, onToggle }: {
  label: string;
  count: number;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? 'model-facet active' : 'model-facet'}
      onClick={onToggle}
      aria-pressed={active}
      // A zero-count facet stays clickable when it is the active one, or there
      // would be no way to turn off the filter that emptied the table.
      disabled={count === 0 && !active}
    >
      <span className="model-facet-box" aria-hidden="true">
        {active && <Check />}
      </span>
      <span className="model-facet-label">{label}</span>
      <span className="model-facet-count">{count}</span>
    </button>
  );
}

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
  /**
   * The filter rail, open by default on any window wide enough to hold it.
   *
   * Read once, not subscribed to resize: a rail that shuts itself because the
   * window was nudged would undo a deliberate choice. The media query in the
   * stylesheet still hides it below 1240px, so a narrow window never has the
   * rail eating the table — it just gets it back when it widens again.
   */
  const [railOpen, setRailOpen] = useState(() =>
    typeof window === 'undefined' || window.matchMedia('(min-width: 1240px)').matches);
  /**
   * Newness is its own axis, not one of the eight single-select quick filters.
   * "The ones that just appeared" is a question you ask alongside "the ones
   * that fit", not instead of it.
   */
  const [newOnly, setNewOnly] = useState(false);
  /**
   * Families the reader has opened. Collapsed is the default because the
   * problem being solved is thirty-five near-identical Gemma 4 rows; a table
   * that opens everything by default has not collapsed anything.
   */
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(() => new Set());
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [showAllDevelopers, setShowAllDevelopers] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestIndex, setSuggestIndex] = useState(-1);
  const searchWrapRef = useRef<HTMLDivElement>(null);
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
  /**
   * A model that cannot run on this machine is not a choice, it is noise.
   *
   * The -mlx builds need macOS on Apple Silicon. On a Windows box they were
   * still listed, badged "MACOS ONLY", and counted — a 4070 reporting 147
   * models that fit was counting builds it can never load, and every Gemma 4
   * family carried two of them.
   *
   * Filtered rather than badged because the badge was already there and did
   * not help: the row still took its place in the table, still appeared in
   * every facet count, and still had to be read and dismissed.
   */
  const passesPlatform = useCallback(
    (row: ModelRow) => getPlatformFit(row.displayName, platform).compatible,
    [platform],
  );
  const passesNew = useCallback(
    (row: ModelRow) => !newOnly || newModelIds.has(getModelNewsId(row)),
    [newOnly, newModelIds],
  );
  const passesTask = useCallback(
    (row: ModelRow) => !taskFilter || modelMatchesTask(row, taskFilter),
    [taskFilter],
  );

  const quickFilters = useMemo(
    () => getModelQuickFilters(rows.filter((row) => passesQuery(row) && passesDeveloper(row) && passesTask(row) && passesNew(row) && passesPlatform(row)), modelScores, vramGb),
    [rows, modelScores, vramGb, passesQuery, passesDeveloper, passesTask, passesNew, passesPlatform],
  );
  // Headline "N models look realistic for your VRAM" is about the rig, not the
  // current filter selection, so it stays a whole-catalog figure.
  const vramSafeCount = useMemo(
    () => getModelQuickFilters(rows.filter(passesPlatform), modelScores, vramGb).find((filter) => filter.id === 'fits-vram')?.count ?? 0,
    [rows, modelScores, vramGb, passesPlatform],
  );
  const taskFilterCounts = useMemo(() => {
    const base = rows.filter((row) => passesQuery(row) && passesDeveloper(row) && passesQuick(row) && passesNew(row) && passesPlatform(row));
    return Object.fromEntries(TASK_FILTER_CHIPS.map((chip) => [chip.id, base.filter((row) => modelMatchesTask(row, chip.id)).length]));
  }, [rows, passesQuery, passesDeveloper, passesQuick, passesNew, passesPlatform]);
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
    () => getDeveloperFilterOptions(rows.filter((row) => passesQuery(row) && passesQuick(row) && passesTask(row) && passesNew(row) && passesPlatform(row))),
    [rows, passesQuery, passesQuick, passesTask, passesNew, passesPlatform],
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
      (row) => passesQuery(row) && passesDeveloper(row) && passesQuick(row) && passesTask(row) && passesNew(row) && passesPlatform(row),
    );

    return sortModelRows(filteredRows, sortKey, sortDirection, queuedModelIds, modelScores, benchmarkByModel);
  }, [benchmarkByModel, modelScores, passesQuery, passesDeveloper, passesQuick, passesTask, passesNew, passesPlatform, queuedModelIds, rows, sortDirection, sortKey]);
  /**
   * One row per family, in the order the chosen sort already put them.
   *
   * A variant is only a fair face for its family if it can run here: an -mlx
   * build on Windows would make an available family look unavailable.
   */
  const groupedRows = useMemo(
    () => groupRowsByFamily(visibleRows, {
      familyOf: (row) => getFriendlyModelName(row.displayName),
      isPreferred: (row) => getPlatformFit(row.displayName, platform).compatible
        && (installedModelNames.has(row.displayName) || row.installed),
    }),
    [visibleRows, platform, installedModelNames],
  );
  /**
   * Searching opens what it found. Typing "e2b" and getting a shut "Gemma4"
   * row would hide the match behind the very control meant to reveal it.
   */
  const searchExpandedFamilies = useMemo(
    () => familiesToAutoExpand(groupedRows, query, (row) => getModelSearchText(
      row,
      queuedModelIds.has(row.displayName),
      getModelScore(row, modelScores),
    ).includes(query)),
    [groupedRows, query, queuedModelIds, modelScores],
  );
  const openFamilies = useMemo(
    () => new Set([...expandedFamilies, ...searchExpandedFamilies]),
    [expandedFamilies, searchExpandedFamilies],
  );
  // Say what each number counts — the catalog total, the installed count, and the
  // VRAM-fit count are different measures and read as contradictory when all three
  // are just "N models".
  const modelCountLabel = query || quickFilter !== 'all' || taskFilter || activeDeveloperFilter !== 'all' || newOnly
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
    newOnly ? 'New' : null,
  ].filter(Boolean).join(' · ');
  const activeFilterCount = [
    quickFilter !== 'all',
    activeDeveloperFilter !== 'all',
    Boolean(taskFilter),
    newOnly,
  ].filter(Boolean).length;

  const facetGroups = useMemo(
    () => buildQuickFacetGroups(quickFilters, vramGb > 0 ? formatGb(vramGb) : ''),
    [quickFilters, vramGb],
  );
  // Five is what fits without the rail needing a scroll on a 768-tall screen.
  // The rest are one click away, and an active chip is never among the hidden
  // ones or it could not be turned off.
  const FACET_PREVIEW = 5;
  // Uncensored is drawn under its own heading rather than as the fourth job in
  // a list of jobs. It is not something you want a model *for*.
  const { goodFor: goodForFilters, standalone: standaloneFilters } = splitTaskFilters(offerableTaskFilters);
  const visibleTaskFilters = showAllTasks ? goodForFilters : goodForFilters.slice(0, FACET_PREVIEW);
  const shownTaskFilters = taskFilter && !visibleTaskFilters.some((chip) => chip.id === taskFilter)
    ? [...visibleTaskFilters, ...goodForFilters.filter((chip) => chip.id === taskFilter)]
    : visibleTaskFilters;
  const hiddenTaskCount = goodForFilters.length - shownTaskFilters.length;
  const newModelCount = useMemo(
    () => rows.filter((row) => newModelIds.has(getModelNewsId(row))).length,
    [rows, newModelIds],
  );
  const visibleDeveloperOptions = showAllDevelopers ? developerFilterOptions : developerFilterOptions.slice(0, FACET_PREVIEW);
  const shownDeveloperOptions = activeDeveloperFilter !== 'all' && !visibleDeveloperOptions.some((option) => option.id === activeDeveloperFilter)
    ? [...visibleDeveloperOptions, ...developerFilterOptions.filter((option) => option.id === activeDeveloperFilter)]
    : visibleDeveloperOptions;
  const hiddenDeveloperCount = developerFilterOptions.length - shownDeveloperOptions.length;

  const resetFilters = useCallback(() => {
    setQuickFilter('all');
    setDeveloperFilter('all');
    setTaskFilter(null);
    // Reset has to reach every filter, including the ones added after it was
    // written, or it half-works and the table stays narrowed for no visible
    // reason.
    setNewOnly(false);
  }, []);

  /**
   * Suggestions count against the whole catalogue, not the filtered view.
   *
   * A suggestion is an offer to change what you are looking at, so counting it
   * inside the current selection would make it promise a number it will not
   * deliver the moment it is clicked.
   */
  const suggestionQuickFilters = useMemo(
    () => getModelQuickFilters(rows, modelScores, vramGb),
    [rows, modelScores, vramGb],
  );
  const suggestionTaskCounts = useMemo(
    () => Object.fromEntries(TASK_FILTER_CHIPS.map((chip) => [chip.id, rows.filter((row) => modelMatchesTask(row, chip.id)).length])),
    [rows],
  );
  const suggestionDeveloperOptions = useMemo(() => getDeveloperFilterOptions(rows), [rows]);
  const suggestions = useMemo(
    () => buildSearchSuggestions({
      query,
      rows,
      quickFilters: suggestionQuickFilters,
      taskFilters: TASK_FILTER_CHIPS,
      taskCounts: suggestionTaskCounts,
      developerOptions: suggestionDeveloperOptions,
    }),
    [query, rows, suggestionQuickFilters, suggestionTaskCounts, suggestionDeveloperOptions],
  );
  const showSuggestions = suggestOpen && suggestions.length > 0;

  /**
   * Picking a filter suggestion clears the box.
   *
   * Leaving "cod" in the search while the Coding filter goes on would AND the
   * two together, and the reader — who typed once and clicked once — would have
   * no way to tell which of the two cut the list down.
   */
  const applySuggestion = useCallback((suggestion: SearchSuggestion) => {
    setSuggestOpen(false);
    setSuggestIndex(-1);
    if (suggestion.kind === 'model') {
      setModelQuery(suggestion.label);
      onSelect(suggestion.id);
      return;
    }
    setModelQuery('');
    if (suggestion.kind === 'quick') setQuickFilter(suggestion.id);
    else if (suggestion.kind === 'task') setTaskFilter(suggestion.id);
    else setDeveloperFilter(suggestion.id);
  }, [onSelect]);

  // Clicking anywhere else puts the dropdown away. Without this it survives a
  // click on the table underneath it and covers the rows it was meant to find.
  useEffect(() => {
    if (!showSuggestions) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!searchWrapRef.current?.contains(event.target as Node)) {
        setSuggestOpen(false);
        setSuggestIndex(-1);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [showSuggestions]);

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
      <div className={railOpen ? 'cabinet-body rail-open' : 'cabinet-body'}>
      {railOpen && (
        <aside className="model-facets" id="model-facet-rail" aria-label="Model filters">
          <div className="model-facets-head">
            <span>Filters</span>
            <button type="button" onClick={resetFilters} disabled={activeFilterCount === 0}>
              Reset
            </button>
          </div>
          {facetGroups.map((group) => (
            <div className="model-facet-group" key={group.id}>
              <h3>{group.label}</h3>
              {group.items.map((item) => (
                <FacetButton
                  key={item.id}
                  label={item.label}
                  count={item.count}
                  active={quickFilter === item.id}
                  onToggle={() => setQuickFilter(quickFilter === item.id ? 'all' : item.id as ModelQuickFilterId)}
                />
              ))}
            </div>
          ))}
          <div className="model-facet-group">
            <h3>Good for</h3>
            {shownTaskFilters.map((chip) => (
              <FacetButton
                key={chip.id}
                label={chip.label}
                count={taskFilterCounts[chip.id] ?? 0}
                active={taskFilter === chip.id}
                onToggle={() => setTaskFilter(taskFilter === chip.id ? null : chip.id)}
              />
            ))}
            {hiddenTaskCount > 0 && (
              <button type="button" className="model-facet-more" onClick={() => setShowAllTasks(true)}>
                Show {hiddenTaskCount} more
              </button>
            )}
            {showAllTasks && goodForFilters.length > FACET_PREVIEW && (
              <button type="button" className="model-facet-more" onClick={() => setShowAllTasks(false)}>
                Show fewer
              </button>
            )}
          </div>
          {/* Its own group because it answers "what just appeared", which cuts
              across every other question here rather than competing with one.
              It is also the only facet that is not derived from the model
              itself — it is derived from when this machine first saw it. */}
          {newModelCount > 0 && (
            <div className="model-facet-group">
              <h3>Just added</h3>
              <FacetButton
                label="New since last check"
                count={newModelCount}
                active={newOnly}
                onToggle={() => setNewOnly((on) => !on)}
              />
            </div>
          )}
          {standaloneFilters.length > 0 && (
            <div className="model-facet-group">
              <h3>Guardrails</h3>
              {standaloneFilters.map((chip) => (
                <FacetButton
                  key={chip.id}
                  label={chip.label}
                  count={taskFilterCounts[chip.id] ?? 0}
                  active={taskFilter === chip.id}
                  onToggle={() => setTaskFilter(taskFilter === chip.id ? null : chip.id)}
                />
              ))}
            </div>
          )}
          <div className="model-facet-group">
            <h3>Made by</h3>
            {shownDeveloperOptions.map((option) => (
              <FacetButton
                key={option.id}
                label={option.label}
                count={option.count}
                active={activeDeveloperFilter === option.id}
                onToggle={() => setDeveloperFilter(activeDeveloperFilter === option.id ? 'all' : option.id)}
              />
            ))}
            {hiddenDeveloperCount > 0 && (
              <button type="button" className="model-facet-more" onClick={() => setShowAllDevelopers(true)}>
                Show {hiddenDeveloperCount} more
              </button>
            )}
            {showAllDevelopers && developerFilterOptions.length > FACET_PREVIEW && (
              <button type="button" className="model-facet-more" onClick={() => setShowAllDevelopers(false)}>
                Show fewer
              </button>
            )}
          </div>
        </aside>
      )}
      <div className="cabinet-main">
      {installedModelNames.size === 0 && isDesktopRuntime && (
        <FirstModelWizard vramGb={vramGb} onQueueModel={(modelId) => {
          const row = rows.find((r) => r.id === modelId || r.displayName === modelId);
          if (row) onQueueModel(row);
        }} />
      )}
      <div className="model-tools">
        <div className="model-search-wrap" ref={searchWrapRef}>
          <label className="model-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Search models</span>
            <input
              type="search"
              value={modelQuery}
              onChange={(event) => {
                setModelQuery(event.target.value);
                setSuggestOpen(true);
                setSuggestIndex(-1);
              }}
              onFocus={() => setSuggestOpen(true)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  if (showSuggestions) {
                    setSuggestOpen(false);
                    setSuggestIndex(-1);
                  } else {
                    setModelQuery('');
                  }
                  return;
                }
                if (!showSuggestions) return;
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setSuggestIndex((current) => (current + 1) % suggestions.length);
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setSuggestIndex((current) => (current <= 0 ? suggestions.length : current) - 1);
                } else if (event.key === 'Enter' && suggestIndex >= 0) {
                  event.preventDefault();
                  applySuggestion(suggestions[suggestIndex]);
                }
              }}
              placeholder="Search models, or type what you want them for..."
              aria-label="Search models"
              role="combobox"
              aria-expanded={showSuggestions}
              aria-controls="model-search-suggestions"
              aria-autocomplete="list"
              aria-activedescendant={suggestIndex >= 0 ? `model-suggestion-${suggestIndex}` : undefined}
            />
            {modelQuery && (
              <button type="button" onClick={() => { setModelQuery(''); setSuggestOpen(false); }} aria-label="Clear model search">
                <X aria-hidden="true" />
              </button>
            )}
          </label>
          {showSuggestions && (
            <ul className="model-search-suggestions" id="model-search-suggestions" role="listbox" aria-label="Search suggestions">
              {suggestions.map((suggestion, index) => (
                <li key={`${suggestion.kind}-${suggestion.id}`}>
                  <button
                    type="button"
                    id={`model-suggestion-${index}`}
                    role="option"
                    aria-selected={index === suggestIndex}
                    className={index === suggestIndex ? 'active' : ''}
                    onMouseEnter={() => setSuggestIndex(index)}
                    onClick={() => applySuggestion(suggestion)}
                  >
                    <em>{suggestion.kind === 'model' ? 'Model' : suggestion.groupLabel}</em>
                    <span>{suggestion.label}</span>
                    <b>{suggestion.kind === 'model' ? formatGb(suggestion.count) : suggestion.count}</b>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <span className="model-sort-status advanced-only">
          Sort: {getModelSortLabel(sortKey)} / {sortDirection === 'asc' ? 'Asc' : 'Desc'}
        </span>
        <button
          type="button"
          className={railOpen ? 'model-filter-toggle active' : 'model-filter-toggle'}
          onClick={() => setRailOpen((open) => !open)}
          aria-pressed={railOpen}
          aria-controls="model-facet-rail"
        >
          <SlidersHorizontal aria-hidden="true" />
          <span>Filters</span>
          <em>{activeFilterSummary || 'None on'}</em>
        </button>
      </div>
      {/* The notes moved out of the filter tray they used to live in.
          Every one of them explains why the table below looks the way it does,
          and inside a panel that closed the moment you picked a filter they
          answered somewhere the eye was not. */}
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
            {/* An IIFE so the 300-line row renderer can be reused for both a plain
                row and a group's children without moving it out of the table it
                belongs to. */}
            {(() => {
            const renderRow = (row: ModelRow) => {
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
                        {/* Only what the row cannot already say for itself.
                            The size is beside this already, the quantization
                            too, and there is an Uncensored badge further along
                            — repeating those would be three more chips saying
                            what is on screen. What is left is the part nothing
                            explained: that an "e2b" is an effective size, which
                            is why the number next to it reads 5.1B and not 2B. */}
                        {describeModelTag(row.displayName)
                          .filter((fact) => fact.kind === 'effective' || fact.kind === 'tuning')
                          .map((fact) => (
                            <em key={fact.kind} className="model-variant-sub" title={fact.plain}>{fact.label}</em>
                          ))}
                        {/* Only when the Popularity column is not on screen.
                            This line and that column carried the same number on
                            the same row — twice per row, and then thirty-five
                            times over for a family, since Ollama counts pulls
                            per family rather than per tag. Narrow windows drop
                            the column, and there this is the only place it
                            appears. */}
                        {hidePopularity && row.pulls != null && (
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
            };
            return groupedRows.flatMap((entry) => {
              if (entry.kind === 'row') return [renderRow(entry.row)];
              const { family, rows: variants, best } = entry.group;
              const open = openFamilies.has(family);
              const installedCount = variants.filter((v) => installedModelNames.has(v.displayName) || v.installed).length;
              const bestScore = getModelScore(best, modelScores);
              return [
                <tr key={`family:${family}`} className={open ? 'model-family-row open' : 'model-family-row'}>
                  <td colSpan={(hidePopularity ? 7 : 8) + (showAdded ? 1 : 0)}>
                    <button
                      type="button"
                      onClick={() => setExpandedFamilies((current) => {
                        const next = new Set(current);
                        if (next.has(family)) next.delete(family);
                        else next.add(family);
                        return next;
                      })}
                      aria-expanded={open}
                    >
                      <ChevronRight aria-hidden="true" className={open ? 'model-family-caret open' : 'model-family-caret'} />
                      <strong>{family}</strong>
                      {/* A group is never smaller than two today, but the
                          plural is one word and a "1 versions" shipped once is
                          the kind of thing nobody goes back to fix. */}
                      <em>{variants.length} version{variants.length === 1 ? '' : 's'}</em>
                      {installedCount > 0 && <span className="model-family-installed">{installedCount} installed</span>}
                      {bestScore && <span className="model-family-best">Best {bestScore.total} · {bestScore.grade}</span>}
                      {/* Popularity is a property of the family, not of a tag:
                          Ollama counts pulls per family, which is why every one
                          of thirty-five Gemma 4 rows read "23.9M pulls". It
                          belongs here, once, where that is what it means. */}
                      {best.pulls != null && (
                        <span className="model-family-pulls" title={`${best.pulls.toLocaleString()} pulls on Ollama, counted across the whole family`}>
                          {formatPullCount(best.pulls)} pulls
                        </span>
                      )}
                      <span className="model-family-hint">{open ? 'Hide' : 'Show'}</span>
                    </button>
                  </td>
                </tr>,
                ...(open ? variants.map(renderRow) : []),
              ];
            });
            })()}
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
