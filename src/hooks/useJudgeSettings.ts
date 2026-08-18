import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  CLOUD_JUDGE_MODEL_STORAGE_KEY,
  DEFAULT_CLOUD_JUDGE_MODEL,
  JUDGE_MODEL_STORAGE_KEY,
  JUDGE_SOURCE_STORAGE_KEY,
  OPENROUTER_KEY_STORAGE_KEY,
  QUALITY_MODE_STORAGE_KEY,
} from '../lib/appConfig';
import { textJudgeCandidates } from '../lib/modelCatalog';
import type { ModelRow } from '../types';

export type JudgeConfig = { provider: 'local' | 'openrouter'; model: string; apiKey?: string };

/**
 * Who grades the answers, and with what.
 *
 * Five stored settings and the four derived values every run reads. The
 * derivations are the substance — each one encodes a decision about not lying
 * to the user with a score:
 *
 *  - a cloud judge with no API key produces null, so the run falls back to the
 *    heuristic rather than silently to some other judge they did not pick;
 *  - autoJudgeModels is never the cloud judge, because auto-engaging something
 *    that costs money and leaves the machine would be wrong however good the
 *    score;
 *  - it returns the whole ordered list, so the main process can drop whichever
 *    model is under test — a model marking its own answers grades itself
 *    generously, and that score then crowns a Match.
 *
 * installedRowsForCleanup comes in as a parameter: the candidate list is
 * whatever is installed, which this hook has no business working out for
 * itself.
 */
export function useJudgeSettings({ installedRows }: { installedRows: ModelRow[] }) {
  const [qualityMode, setQualityMode] = useState<'heuristic' | 'judge'>(() => {
    try { return localStorage.getItem(QUALITY_MODE_STORAGE_KEY) === 'judge' ? 'judge' : 'heuristic'; }
    catch { return 'heuristic'; }
  });
  const [judgeModel, setJudgeModel] = useState<string>(() => {
    try { return localStorage.getItem(JUDGE_MODEL_STORAGE_KEY) ?? ''; }
    catch { return ''; }
  });
  // Judge source: 'local' grades with an installed Ollama model (default, 100% on-
  // device); 'openrouter' grades with a cloud model — strictly opt-in because it
  // sends graded content off this computer and costs API credits.
  const [judgeSource, setJudgeSource] = useState<'local' | 'openrouter'>(() => {
    try { return localStorage.getItem(JUDGE_SOURCE_STORAGE_KEY) === 'openrouter' ? 'openrouter' : 'local'; }
    catch { return 'local'; }
  });
  const [cloudJudgeModel, setCloudJudgeModel] = useState<string>(() => {
    try { return localStorage.getItem(CLOUD_JUDGE_MODEL_STORAGE_KEY) ?? DEFAULT_CLOUD_JUDGE_MODEL; }
    catch { return DEFAULT_CLOUD_JUDGE_MODEL; }
  });
  const [openRouterKey, setOpenRouterKey] = useState<string>(() => {
    try { return localStorage.getItem(OPENROUTER_KEY_STORAGE_KEY) ?? ''; }
    catch { return ''; }
  });

  // Text-capable models only, largest first — not simply the biggest file: an
  // embedding or OCR model is often the largest thing installed and grades
  // prose as confident nonsense.
  const judgeModelOptions = useMemo(
    () => textJudgeCandidates(installedRows),
    [installedRows],
  );

  // The judge model actually sent with a run: the user's pick if it's still
  // installed, otherwise the largest installed model. Empty when judging is off
  // or nothing is installed (backend then falls back to the heuristic).
  const effectiveJudgeModel = useMemo(() => {
    if (qualityMode !== 'judge') return '';
    if (judgeModel && judgeModelOptions.includes(judgeModel)) return judgeModel;
    return judgeModelOptions[0] ?? '';
  }, [qualityMode, judgeModel, judgeModelOptions]);

  /**
   * A local model to mark the answers the rules cannot, when judging is off.
   *
   * Chat and writing questions have no shape for the heuristic to match, so
   * 0.6 stopped them crowning anyone — which left those goals graded but
   * uncrownable unless the user found the judge setting.
   */
  const autoJudgeModels = useMemo(() => {
    if (qualityMode === 'judge') return [];
    return judgeModelOptions;
  }, [qualityMode, judgeModelOptions]);

  const effectiveJudge = useMemo<JudgeConfig | null>(() => {
    if (qualityMode !== 'judge') return null;
    if (judgeSource === 'openrouter') {
      const model = cloudJudgeModel.trim();
      const apiKey = openRouterKey.trim();
      return model && apiKey ? { provider: 'openrouter', model, apiKey } : null;
    }
    return effectiveJudgeModel ? { provider: 'local', model: effectiveJudgeModel } : null;
  }, [qualityMode, judgeSource, cloudJudgeModel, openRouterKey, effectiveJudgeModel]);

  useEffect(() => {
    try { localStorage.setItem(QUALITY_MODE_STORAGE_KEY, qualityMode); } catch { /* ignore */ }
  }, [qualityMode]);
  useEffect(() => {
    try { localStorage.setItem(JUDGE_MODEL_STORAGE_KEY, judgeModel); } catch { /* ignore */ }
  }, [judgeModel]);
  useEffect(() => {
    try { localStorage.setItem(JUDGE_SOURCE_STORAGE_KEY, judgeSource); } catch { /* ignore */ }
  }, [judgeSource]);
  useEffect(() => {
    try { localStorage.setItem(CLOUD_JUDGE_MODEL_STORAGE_KEY, cloudJudgeModel); } catch { /* ignore */ }
  }, [cloudJudgeModel]);
  useEffect(() => {
    try { localStorage.setItem(OPENROUTER_KEY_STORAGE_KEY, openRouterKey); } catch { /* ignore */ }
  }, [openRouterKey]);

  /**
   * Back to first-run defaults, for "Clear Data".
   *
   * The API key is the reason this exists rather than the wipe setting five
   * values itself: the sweep removes the stored key, but the value also lives
   * in state and in a visible field, and the save effect above would write it
   * straight back on the next edit.
   */
  const resetJudgeSettings = useCallback(() => {
    setQualityMode('heuristic');
    setJudgeModel('');
    setJudgeSource('local');
    setCloudJudgeModel(DEFAULT_CLOUD_JUDGE_MODEL);
    setOpenRouterKey('');
  }, []);

  return {
    qualityMode,
    setQualityMode,
    judgeModel,
    setJudgeModel,
    judgeSource,
    setJudgeSource,
    cloudJudgeModel,
    setCloudJudgeModel,
    openRouterKey,
    setOpenRouterKey,
    judgeModelOptions,
    effectiveJudgeModel,
    autoJudgeModels,
    effectiveJudge,
    resetJudgeSettings,
  };
}
