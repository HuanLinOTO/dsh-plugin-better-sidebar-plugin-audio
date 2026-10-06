/**
 * The waveform viewport: which slice of the timeline is on screen, and the
 * time<->pixel mapping built on it. Pure functions only, so the zoom/pan feel
 * is unit-testable without a canvas.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/view
 */

/** Visible time window, in seconds, end-exclusive on screen but inclusive here. */
export interface WaveView {
  /** Left edge, in seconds. */
  start: number
  /** Right edge, in seconds. */
  end: number
}

/** Tightest window the viewer allows (20 ms — about one cycle at 50 Hz). */
export const MIN_SPAN_SECONDS = 0.02

/**
 * The whole-file window.
 * @param duration - file duration in seconds.
 * @returns a window spanning the file (never zero-length).
 */
export function fullView(duration: number): WaveView {
  return { start: 0, end: Math.max(duration, MIN_SPAN_SECONDS) }
}

/**
 * Force a window into the file's bounds, respecting the minimum span.
 * @param view - requested window (may be inverted, NaN, or out of bounds).
 * @param duration - file duration in seconds.
 * @param minSpan - smallest allowed span in seconds.
 * @returns a valid window inside `[0, duration]`.
 */
export function clampView(view: WaveView, duration: number, minSpan = MIN_SPAN_SECONDS): WaveView {
  const total = Math.max(duration, 0)
  // Never let the window run past the end of the file: for a file shorter than
  // the minimum span, the whole file IS the tightest window there is.
  const floor = Math.min(minSpan, total > 0 ? total : minSpan)
  const maxSpan = Math.max(total, floor)
  const requested = view.end - view.start
  let span = Number.isFinite(requested) && requested > 0 ? requested : maxSpan
  span = Math.min(Math.max(span, floor), maxSpan)
  let start = Number.isFinite(view.start) ? view.start : 0
  if (start < 0) start = 0
  if (start + span > total) start = Math.max(0, total - span)
  return { start, end: start + span }
}

/**
 * Zoom around a focus time.
 * @param view - current window.
 * @param focus - time that must stay under the cursor.
 * @param factor - < 1 zooms in, > 1 zooms out.
 * @param duration - file duration in seconds.
 * @param minSpan - smallest allowed span in seconds.
 * @returns the zoomed window.
 */
export function zoomView(view: WaveView, focus: number, factor: number, duration: number, minSpan = MIN_SPAN_SECONDS): WaveView {
  const span = view.end - view.start
  const next = span * factor
  const ratio = span <= 0 ? 0.5 : Math.min(Math.max((focus - view.start) / span, 0), 1)
  const start = focus - next * ratio
  return clampView({ start, end: start + next }, duration, minSpan)
}

/**
 * Shift a window by a time delta.
 * @param view - current window.
 * @param delta - seconds to move right (negative moves left).
 * @param duration - file duration in seconds.
 * @returns the panned window.
 */
export function panView(view: WaveView, delta: number, duration: number): WaveView {
  const span = view.end - view.start
  return clampView({ start: view.start + delta, end: view.start + delta + span }, duration)
}

/**
 * Time under one horizontal pixel.
 * @param view - current window.
 * @param x - pixel offset.
 * @param width - canvas width in CSS pixels.
 * @returns the time at that pixel.
 */
export function timeAtX(view: WaveView, x: number, width: number): number {
  if (width <= 0) return view.start
  return view.start + (view.end - view.start) * (x / width)
}

/**
 * Pixel offset of one time.
 * @param view - current window.
 * @param time - seconds.
 * @param width - canvas width in CSS pixels.
 * @returns the pixel offset (may fall outside the canvas).
 */
export function xAtTime(view: WaveView, time: number, width: number): number {
  const span = view.end - view.start
  if (span <= 0) return 0
  return ((time - view.start) / span) * width
}

/** Candidate ruler steps, in seconds (1 ms to 1 h). */
const TICK_STEPS = [
  0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5,
  1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600,
]

/**
 * Pick a ruler step for a window.
 * @param span - visible span in seconds.
 * @param width - canvas width in CSS pixels.
 * @param minPx - smallest accepted spacing between ticks.
 * @returns the step in seconds.
 */
export function tickStep(span: number, width: number, minPx = 72): number {
  const maxTicks = Math.max(1, Math.floor(Math.max(width, 1) / minPx))
  const ideal = Math.max(span, 0) / maxTicks
  for (const step of TICK_STEPS) if (step >= ideal) return step
  return TICK_STEPS[TICK_STEPS.length - 1] ?? 3600
}

/**
 * Ruler tick positions for a window.
 * @param view - current window.
 * @param width - canvas width in CSS pixels.
 * @param minPx - smallest accepted spacing between ticks.
 * @returns times to label, in ascending order.
 */
export function ticks(view: WaveView, width: number, minPx = 72): number[] {
  const span = view.end - view.start
  const step = tickStep(span, width, minPx)
  const first = Math.ceil(view.start / step) * step
  const out: number[] = []
  for (let time = first; time <= view.end + step * 1e-6 && out.length < 512; time += step) {
    if (time >= view.start - step * 1e-6) out.push(Number(time.toFixed(6)))
  }
  return out
}

/**
 * Format a position on the timeline.
 * @param seconds - time in seconds (negative clamps to 0).
 * @param millis - include milliseconds (used for the cursor read-out).
 * @returns `m:ss` / `h:mm:ss`, with `.mmm` when requested.
 */
export function formatTime(seconds: number, millis = false): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const whole = Math.floor(safe % 60)
  const base = hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(whole).padStart(2, '0')}`
    : `${minutes}:${String(whole).padStart(2, '0')}`
  if (!millis) return base
  return `${base}.${String(Math.floor((safe % 1) * 1000)).padStart(3, '0')}`
}

/**
 * Format a frequency for the spectrum read-out / ruler.
 * @param hz - frequency in hertz.
 * @returns `nn Hz` below 1 kHz, `n.nn kHz` above.
 */
export function formatHz(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return '0 Hz'
  if (hz < 1000) return `${Math.round(hz)} Hz`
  return `${(hz / 1000).toFixed(hz < 10000 ? 2 : 1)} kHz`
}
