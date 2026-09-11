// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useSyncExternalStore } from 'react';
import { labResultsSnapshot, subscribeLabResults, type AdvancedLabResult } from '../lib/labResults';

/** Every saved Lab result, re-read whenever any test writes a new one. */
export function useLabResults(): Record<string, AdvancedLabResult> {
  return useSyncExternalStore(subscribeLabResults, labResultsSnapshot);
}
