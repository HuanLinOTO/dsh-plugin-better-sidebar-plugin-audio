/**
 * Canvas painting for the four surfaces: the waveform (with its time ruler),
 * the live spectrum, the waterfall bitmap and the whole-file spectrogram.
 *
 * Painters never fill their own background: the container supplies it through
 * CSS (which resolves the host tokens properly), so the canvas stays
 * transparent and every colour that reaches `fillStyle` is a concrete colour
 * from {@link CanvasPalette} — never a `var()` a canvas would silently drop.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/draw
 */
import type { CanvasPalette } from './theme.ts';
import type { ChannelPeaks } from './peaks.ts';
import type { Selection } from './selection.ts';
import { type SpectrumLayout } from './spectrum.ts';
import { type FrequencyScale } from './spectrogram.ts';
import { tickStep, type WaveView } from './view.ts';
/** Paint request for the waveform lane. */
export interface WaveformPaint {
    /** Canvas width in CSS pixels. */
    width: number;
    /** Canvas height in CSS pixels. */
    height: number;
    /** Visible window. */
    view: WaveView;
    /**
     * Time span the peaks array covers — the whole file for the decoded
     * envelope, or exactly the visible window for an envelope re-derived from
     * PCM. The envelope columns are mapped through this, never through the
     * canvas width, so zooming crops the envelope instead of squeezing the
     * whole file into the lane whatever the window is.
     */
    duration: number;
    /** Time the peaks array starts at (0 for the whole file, the window start for a re-derived envelope). */
    peaksStart: number;
    /** Envelope to draw (already the selected channel's). */
    peaks: ChannelPeaks;
    /** Overlay the RMS body. */
    showRms: boolean;
    /** Playback position in seconds, or null when unknown. */
    playhead: number | null;
    /** Selection band, or null. */
    selection: Selection | null;
    /** Palette. */
    colors: CanvasPalette;
}
/**
 * Paint the waveform: time grid, envelope, RMS overlay, selection, playhead.
 * @param g - a 2D context already scaled for the device pixel ratio.
 * @param paint - geometry, data and palette.
 */
export declare function drawWaveform(g: CanvasRenderingContext2D, paint: WaveformPaint): void;
/** Paint request for the time ruler. */
export interface RulerPaint {
    /** Canvas width in CSS pixels. */
    width: number;
    /** Canvas height in CSS pixels. */
    height: number;
    /** Visible window. */
    view: WaveView;
    /** Palette. */
    colors: CanvasPalette;
}
/**
 * Paint the time ruler under the main lane.
 * @param g - a 2D context already scaled for the device pixel ratio.
 * @param paint - geometry, window and palette.
 */
export declare function drawTimeRuler(g: CanvasRenderingContext2D, paint: RulerPaint): void;
/** Paint request for the live spectrum lane. */
export interface SpectrumPaint {
    /** Canvas width in CSS pixels. */
    width: number;
    /** Canvas height in CSS pixels. */
    height: number;
    /** One magnitude per pixel column, 0..1. */
    values: Float32Array;
    /** Bars or line. */
    style: 'bars' | 'line';
    /** Axis layout (must agree with `values.length`). */
    layout: SpectrumLayout;
    /** Frequency of the loudest bin, or null. */
    peakHz: number | null;
    /** Frequency under the pointer, or null. */
    cursorHz: number | null;
    /** Palette. */
    colors: CanvasPalette;
}
/**
 * Paint the live spectrum.
 * @param g - a 2D context already scaled for the device pixel ratio.
 * @param paint - geometry, magnitudes and palette.
 */
export declare function drawSpectrum(g: CanvasRenderingContext2D, paint: SpectrumPaint): void;
/**
 * Blit a waterfall frame.
 * @param g - a 2D context already scaled for the device pixel ratio.
 * @param frame - the RGBA frame, sized to the canvas.
 */
export declare function drawWaterfallFrame(g: CanvasRenderingContext2D, frame: ImageData): void;
/** The slice of a spectrogram the painter needs. */
export interface SpectrogramFacts {
    /** Time resolution. */
    columns: number;
    /** Frequency resolution. */
    bands: number;
    /** Left edge of the analyzed window, in seconds. */
    startTime: number;
    /** Right edge of the analyzed window, in seconds. */
    endTime: number;
    /** Lowest frequency shown. */
    minHz: number;
    /** Highest frequency shown. */
    maxHz: number;
    /** Frequency spacing of the axis. */
    scale: FrequencyScale;
}
/** Paint request for the whole-file spectrogram lane. */
export interface SpectrogramPaint {
    /** Canvas width in CSS pixels. */
    width: number;
    /** Canvas height in CSS pixels. */
    height: number;
    /** The pre-rendered heat map (one pixel per cell), or null while unavailable. */
    image: CanvasImageSource | null;
    /** Grid facts. */
    spec: SpectrogramFacts;
    /** Visible window (same timeline as the waveform). */
    view: WaveView;
    /** Playback position in seconds, or null. */
    playhead: number | null;
    /** Selection band, or null. */
    selection: Selection | null;
    /** Palette. */
    colors: CanvasPalette;
}
/**
 * Paint the whole-file spectrogram over the visible window.
 * @param g - a 2D context already scaled for the device pixel ratio.
 * @param paint - geometry, the heat map and the palette.
 */
export declare function drawSpectrogramFrame(g: CanvasRenderingContext2D, paint: SpectrogramPaint): void;
/** Re-export for the painter tests. */
export { tickStep };
