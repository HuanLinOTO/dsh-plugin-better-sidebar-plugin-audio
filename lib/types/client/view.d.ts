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
    start: number;
    /** Right edge, in seconds. */
    end: number;
}
/** Tightest window the viewer allows (20 ms — about one cycle at 50 Hz). */
export declare const MIN_SPAN_SECONDS = 0.02;
/**
 * The whole-file window.
 * @param duration - file duration in seconds.
 * @returns a window spanning the file (never zero-length).
 */
export declare function fullView(duration: number): WaveView;
/**
 * Force a window into the file's bounds, respecting the minimum span.
 * @param view - requested window (may be inverted, NaN, or out of bounds).
 * @param duration - file duration in seconds.
 * @param minSpan - smallest allowed span in seconds.
 * @returns a valid window inside `[0, duration]`.
 */
export declare function clampView(view: WaveView, duration: number, minSpan?: number): WaveView;
/**
 * Zoom around a focus time.
 * @param view - current window.
 * @param focus - time that must stay under the cursor.
 * @param factor - < 1 zooms in, > 1 zooms out.
 * @param duration - file duration in seconds.
 * @param minSpan - smallest allowed span in seconds.
 * @returns the zoomed window.
 */
export declare function zoomView(view: WaveView, focus: number, factor: number, duration: number, minSpan?: number): WaveView;
/**
 * Shift a window by a time delta.
 * @param view - current window.
 * @param delta - seconds to move right (negative moves left).
 * @param duration - file duration in seconds.
 * @returns the panned window.
 */
export declare function panView(view: WaveView, delta: number, duration: number): WaveView;
/**
 * Time under one horizontal pixel.
 * @param view - current window.
 * @param x - pixel offset.
 * @param width - canvas width in CSS pixels.
 * @returns the time at that pixel.
 */
export declare function timeAtX(view: WaveView, x: number, width: number): number;
/**
 * Pixel offset of one time.
 * @param view - current window.
 * @param time - seconds.
 * @param width - canvas width in CSS pixels.
 * @returns the pixel offset (may fall outside the canvas).
 */
export declare function xAtTime(view: WaveView, time: number, width: number): number;
/**
 * Pick a ruler step for a window.
 * @param span - visible span in seconds.
 * @param width - canvas width in CSS pixels.
 * @param minPx - smallest accepted spacing between ticks.
 * @returns the step in seconds.
 */
export declare function tickStep(span: number, width: number, minPx?: number): number;
/**
 * Ruler tick positions for a window.
 * @param view - current window.
 * @param width - canvas width in CSS pixels.
 * @param minPx - smallest accepted spacing between ticks.
 * @returns times to label, in ascending order.
 */
export declare function ticks(view: WaveView, width: number, minPx?: number): number[];
/**
 * Format a position on the timeline.
 * @param seconds - time in seconds (negative clamps to 0).
 * @param millis - include milliseconds (used for the cursor read-out).
 * @returns `m:ss` / `h:mm:ss`, with `.mmm` when requested.
 */
export declare function formatTime(seconds: number, millis?: boolean): string;
/**
 * Format a frequency for the spectrum read-out / ruler.
 * @param hz - frequency in hertz.
 * @returns `nn Hz` below 1 kHz, `n.nn kHz` above.
 */
export declare function formatHz(hz: number): string;
