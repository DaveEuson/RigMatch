import type { GpuContention } from '../types';

/**
 * One short sentence to append to a run's status while it is going.
 *
 * The panel already shows a full contention note, but it arrives three to five
 * seconds after the lab opens — nvidia-smi is slow on a loaded card — and a
 * user who clicks Run inside that window sees nothing at all. That is the case
 * that produced a four-minute wait and a timeout blaming the connection.
 *
 * So the run re-checks and says it in the running message, where someone
 * watching a spinner will actually read it. Deliberately shorter than the
 * panel's message: this is a footnote to "Playing the audio to X...", not a
 * second lecture.
 *
 * `unknown` says nothing. "We could not read your graphics card" during a run
 * is noise the user cannot act on.
 */
export function gpuBusyNote(contention: GpuContention | null): string {
  if (!contention) return '';
  if (contention.level === 'heavy') {
    return ' Your graphics card is busy, so this will take much longer than usual.';
  }
  if (contention.level === 'busy') {
    return ' Something else is using your graphics card, so this may be slower than usual.';
  }
  return '';
}
