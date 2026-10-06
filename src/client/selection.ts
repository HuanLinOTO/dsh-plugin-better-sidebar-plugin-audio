/**
 * Selection and A-B loop maths: the dragged region's read-out (peak / RMS /
 * length) and the wrap-around arithmetic the loop needs. Pure functions.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/selection
 */

import { amplitudeToDb, peaksWindowStats, type ChannelPeaks } from './peaks.ts'
import { xAtTime, type WaveView } from './view.ts'

/** A time range, start < end. */
export interface Selection {
  /** Left edge in seconds. */
  start: number
  /** Right edge in seconds. */
  end: number
}

/**
 * Order two drag endpoints into a selection.
 * @param a - first endpoint in seconds.
 * @param b - second endpoint in seconds.
 * @returns the ordered pair.
 */
export function normalizeSelection(a: number, b: number): Selection {
  return a <= b ? { start: a, end: b } : { start: b, end: a }
}

/** Read-out of one selection. */
export interface SelectionStats {
  /** Selection start in seconds. */
  start: number
  /** Selection end in seconds. */
  end: number
  /** Length in seconds. */
  duration: number
  /** Loudest sample in the window, linear 0..1. */
  peak: number
  /** Mean RMS in the window, linear 0..1. */
  rms: number
  /** Loudest sample in dBFS. */
  peakDb: number
  /** Mean RMS in dBFS. */
  rmsDb: number
}

/**
 * Read a selection out of the envelopes.
 * @param channels - the channels the user is looking at.
 * @param selection - the dragged range.
 * @param view - current window (maps time to column).
 * @param width - canvas width in CSS pixels.
 * @param columns - envelope column count.
 * @returns the statistics shown next to the selection.
 */
export function selectionStats(
  channels: readonly ChannelPeaks[],
  selection: Selection,
  view: WaveView,
  width: number,
  columns: number,
): SelectionStats {
  const span = view.end - view.start
  const toColumn = (time: number): number => {
    if (span <= 0 || columns <= 0 || width <= 0) return 0
    const x = xAtTime(view, time, width)
    return (x / width) * columns
  }
  const stats = peaksWindowStats(channels, toColumn(selection.start), toColumn(selection.end) - 1)
  const duration = Math.max(0, selection.end - selection.start)
  return {
    start: selection.start,
    end: selection.end,
    duration,
    peak: stats.peak,
    rms: stats.rms,
    peakDb: amplitudeToDb(stats.peak),
    rmsDb: amplitudeToDb(stats.rms),
  }
}

/**
 * The loop window an A-B selection defines.
 * @param selection - the dragged range, or null when none exists.
 * @returns the loop window, or null when it is too short to loop.
 */
export function abRange(selection: Selection | null): Selection | null {
  if (selection === null) return null
  return selection.end - selection.start >= 0.01 ? selection : null
}

/**
 * Fold a playback position back into the loop window.
 * @param time - current playback position in seconds.
 * @param range - the active loop window.
 * @returns the position inside the window (the start when it ran past the end).
 */
export function wrapInto(time: number, range: Selection): number {
  if (time < range.start) return range.start
  if (time >= range.end) return range.start
  return time
}
