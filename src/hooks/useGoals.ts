// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useCallback, useState } from 'react';

import type { UiMode } from '../lib/appConfig';
import { MODE_SPLASH_STORAGE_KEY, UI_MODE_STORAGE_KEY } from '../lib/appConfig';
import { goalById, type GoalId } from '../lib/goals';
import {
  firstRunStep,
  hasBeenOfferedGoals,
  markGoalsOffered,
  readSelectedGoals,
  writeSelectedGoals,
  type FirstRunStep,
} from '../lib/goalSettings';
import { hasChosenInterfaceMode } from '../lib/modelCatalog';
import { writeLocal } from '../lib/safeStorage';

/**
 * What the person said they want to do, and the first-run questions that ask.
 *
 * Goals are a lens, never a lock: the first pick leads the Models filter and
 * the wizard's opening dream, and nothing is hidden because of them.
 *
 * The launch question is the subtle part. An upgrading user has already
 * answered the mode question, and the old gate read that as having answered the
 * goal question too — so everyone coming from 0.5 landed in 0.6 with the goal
 * picker, the Matches board and the goal lens all dark. firstRunStep separates
 * the two, which is why this is a step rather than a boolean.
 *
 * Every way of answering is a named method here. The intro's "save" and
 * "cancel" were inline closures in the JSX that each repeated markGoalsOffered
 * and setFirstRun('none') by hand — three copies of the rule that answering the
 * question, or declining it, both count as having been asked.
 */
export function useGoals({
  selectUiMode,
  setActivity,
}: {
  selectUiMode: (mode: UiMode) => void;
  setActivity: (message: string) => void;
}) {
  const [firstRun, setFirstRun] = useState<FirstRunStep>(() => firstRunStep({
    modeChosen: hasChosenInterfaceMode(),
    goalsOffered: hasBeenOfferedGoals(),
  }));
  const showModeSplash = firstRun === 'goals-and-mode';
  const showGoalsIntro = firstRun === 'goals-only';
  // Settings can reopen the goals step of the splash on its own — mistakes at
  // first run must not be permanent, and localStorage is not a settings UI.
  const [showGoalsEditor, setShowGoalsEditor] = useState(false);
  // What the person said they want to do, first pick foremost.
  const [selectedGoals, setSelectedGoals] = useState<GoalId[]>(() => readSelectedGoals());

  /** The first-run splash: a mode and, on the same screen, the goals. */
  const chooseInterfaceMode = useCallback((nextMode: UiMode, goals: GoalId[] = []) => {
    selectUiMode(nextMode);
    // Persist immediately and record that the splash choice was made so it
    // won't reappear next launch. The Simple wizard opens itself at Setup.
    writeLocal(UI_MODE_STORAGE_KEY, nextMode);
    writeLocal(MODE_SPLASH_STORAGE_KEY, 'chosen');
    writeSelectedGoals(goals);
    setSelectedGoals(goals);
    markGoalsOffered();
    setFirstRun('none');
  }, [selectUiMode]);

  /** The upgrade path: goals only, the mode having been chosen in an older version. */
  const saveGoalsFromIntro = useCallback((goals: GoalId[]) => {
    writeSelectedGoals(goals);
    setSelectedGoals(goals);
    markGoalsOffered();
    setFirstRun('none');
  }, []);

  /**
   * Declining still counts as having been asked.
   *
   * Without markGoalsOffered here the intro would return at every launch until
   * the user gave an answer, which is nagging rather than asking.
   */
  const dismissGoalsIntro = useCallback(() => {
    markGoalsOffered();
    setFirstRun('none');
  }, []);

  const saveGoalsFromSettings = useCallback((goals: GoalId[]) => {
    writeSelectedGoals(goals);
    setSelectedGoals(goals);
    setShowGoalsEditor(false);
    const primary = goals[0] ? goalById(goals[0]) : undefined;
    setActivity(primary
      ? `Goals updated. ${primary.matchLabel} now leads Models and Simple Mode.`
      : 'Goals cleared. Models and Simple Mode show everything again.');
  }, [setActivity]);

  /**
   * The in-memory half of "Clear Data". The stored goals go with the storage
   * sweep, and the app genuinely no longer knows them — so being asked again at
   * the next launch is the honest consequence, not a lapse.
   */
  const resetGoals = useCallback(() => {
    setSelectedGoals([]);
  }, []);

  return {
    firstRun,
    showModeSplash,
    showGoalsIntro,
    showGoalsEditor,
    setShowGoalsEditor,
    selectedGoals,
    chooseInterfaceMode,
    saveGoalsFromIntro,
    dismissGoalsIntro,
    saveGoalsFromSettings,
    resetGoals,
  };
}
