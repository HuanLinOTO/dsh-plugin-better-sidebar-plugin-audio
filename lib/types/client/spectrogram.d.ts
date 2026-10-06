/**
 * Spectrogram (the "mel view"): a time x frequency grid of magnitudes.
 *
 * It is computed for the WINDOW CURRENTLY ON SCREEN rather than once for the
 * whole file. That is what keeps zooming sharp: a whole-file grid has to spend
 * its columns across the entire duration, so zooming in only magnifies a few
 * coarse cells, while a windowed grid re-derives the same number of columns
 * from the visible seconds — zoom in ten times and the detail is ten times
 * finer. The window is debounced, so dragging stays responsive.
 *
 * The frequency axis is mel-spaced by default (perceptually even, and dense
 * where speech and music live); log and linear are kept for the tests.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/spectrogram
 */
import type { ThemeVariant } from './theme.ts';
/** Transform size (1024 -> 512 bins). */
export declare const DEFAULT_FFT_SIZE = 1024;
/** Default grid height when the caller has no pixel budget to give. */
export declare const DEFAULT_BANDS = 256;
/** Highest grid height we will build (keeps a tall lane from exploding memory). */
export declare const MAX_BANDS = 512;
/** Dynamic range mapped onto the byte grid. */
export declare const DEFAULT_RANGE_DB = 78;
/** Frequency spacing of the axis. */
export type FrequencyScale = 'mel' | 'log' | 'linear';
/** How the grid is built. */
export interface SpectrogramOptions {
    /** Transform size (power of two). */
    fftSize?: number | undefined;
    /** Grid width in columns. */
    columns?: number | undefined;
    /** Grid height in bands. */
    bands?: number | undefined;
    /** Lowest frequency shown, in hertz. */
    minHz?: number | undefined;
    /** Highest frequency shown, in hertz (clamped to Nyquist). */
    maxHz?: number | undefined;
    /** Frequency spacing. */
    scale?: FrequencyScale | undefined;
    /** Dynamic range in dB mapped across the byte grid. */
    rangeDb?: number | undefined;
}
/** A computed spectrogram over one time window. */
export interface Spectrogram {
    /** Time resolution. */
    columns: number;
    /** Frequency resolution (row count). */
    bands: number;
    /** Magnitudes 0..255, band-major with band 0 = lowest frequency. */
    data: Uint8Array;
    /** Left edge of the analyzed window, in seconds. */
    startTime: number;
    /** Right edge of the analyzed window, in seconds. */
    endTime: number;
    /** Lowest frequency of band 0. */
    minHz: number;
    /** Upper edge of the last band. */
    maxHz: number;
    /** Frequency spacing used. */
    scale: FrequencyScale;
}
/** The frequency window one band covers. */
export interface BandRange {
    /** Lower edge in hertz. */
    from: number;
    /** Upper edge in hertz. */
    to: number;
}
/**
 * Mel of a frequency (the classic 2595 * log10(1 + hz / 700) form).
 * @param hz - frequency in hertz.
 * @returns the mel value.
 */
export declare function hzToMel(hz: number): number;
/**
 * Inverse of {@link hzToMel}.
 * @param mel - mel value.
 * @returns the frequency in hertz.
 */
export declare function melToHz(mel: number): number;
/**
 * Frequency window covered by one band.
 * @param band - band index, 0 = lowest frequency.
 * @param bands - total band count.
 * @param minHz - axis lower bound.
 * @param maxHz - axis upper bound.
 * @param scale - frequency spacing.
 * @returns the band's frequency window.
 */
export declare function bandFrequencyRange(band: number, bands: number, minHz: number, maxHz: number, scale: FrequencyScale): BandRange;
/**
 * Time at the centre of one column.
 * @param column - column index.
 * @param spec - the grid.
 * @returns seconds into the file.
 */
export declare function spectrogramColumnTime(column: number, spec: Spectrogram): number;
/**
 * Column index holding one instant.
 * @param time - seconds into the file.
 * @param spec - the grid.
 * @returns the column, clamped into range.
 */
export declare function spectrogramColumnAt(time: number, spec: Spectrogram): number;
/**
 * Read one cell back as a 0..1 magnitude.
 * @param spec - the grid.
 * @param column - time column.
 * @param band - frequency band (0 = lowest).
 * @returns the magnitude, or 0 outside the grid.
 */
export declare function spectrogramValueAt(spec: Spectrogram, column: number, band: number): number;
/** Input for {@link computeSpectrogramWindow}. */
export interface SpectrogramWindowOptions extends SpectrogramOptions {
    /** Left edge of the window, in seconds. */
    startTime: number;
    /** Right edge of the window, in seconds. */
    endTime: number;
}
/**
 * Compute the spectrogram of one time window.
 * @param mono - downmixed PCM of the whole file.
 * @param sampleRate - sample rate of `mono`.
 * @param options - window, resolution and axis settings.
 * @returns the grid, sized to the requested columns and bands.
 */
export declare function computeSpectrogramWindow(mono: Float32Array, sampleRate: number, options: SpectrogramWindowOptions): Spectrogram;
/**
 * Compute the spectrogram of a whole file.
 * @param channels - decoded PCM per channel (mixed down internally).
 * @param sampleRate - the decoded sample rate.
 * @param duration - the decoded duration in seconds.
 * @param options - resolution and axis settings.
 * @returns the grid.
 */
export declare function computeSpectrogram(channels: readonly Float32Array[], sampleRate: number, duration: number, options?: SpectrogramOptions): Spectrogram;
/**
 * Render the grid into an RGBA buffer, highest frequency on the top row.
 * @param spec - the grid.
 * @param out - destination of columns * bands * 4 bytes.
 * @param variant - active skin (the colour ramp inverts for a light one).
 * @returns the same buffer, filled.
 */
export declare function renderSpectrogramRgba(spec: Spectrogram, out: Uint8ClampedArray, variant?: ThemeVariant): Uint8ClampedArray;
