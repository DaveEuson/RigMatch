// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useSyncExternalStore } from 'react';
import { labResultsSnapshot, labSaveFailure, subscribeLabResults, type AdvancedLabResult } from '../lib/labResults';

/** Every saved Lab result, re-read whenever any test writes a new one. */
export function useLabResults(): Record<string, AdvancedLabResult> {
  return useSyncExternalStore(subscribeLabResults, labResultsSnapshot);
}

/** Why the last Lab result could not be saved, or null; changes with every write. */
export function useLabSaveFailure(): string | null {
  return useSyncExternalStore(subscribeLabResults, labSaveFailure, () => null);
}
