/**
 * Spectrum maths: how FFT bins map onto the drawn columns (log-frequency by
 * default), the peak-bin read-out, and the frequency ruler labels. Pure.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/spectrum
 */
/** How the frequency axis is laid out. */
export interface SpectrumLayout {
    /** FFT size the analyser is configured with (bins = fftSize / 2). */
    fftSize: number;
    /** Sample rate of the analyser's context. */
    sampleRate: number;
    /** Drawn columns (canvas CSS width). */
    columns: number;
    /** Left edge of the axis, in hertz. */
    minHz: number;
    /** Right edge of the axis, in hertz. */
    maxHz: number;
    /** Logarithmic (musical) spacing when true, linear when false. */
    log: boolean;
}
/** Analyser FFT size used by the viewer (2048 bins` => `1024 magnitude bins). */
export declare const FFT_SIZE = 2048;
/** Lowest frequency shown on the axis. */
export declare const MIN_HZ = 30;
/**
 * Build a layout for one canvas size.
 * @param columns - canvas CSS width in pixels.
 * @param sampleRate - the AudioContext sample rate.
 * @param options - axis bounds and spacing.
 * @returns the layout.
 */
export declare function spectrumLayout(columns: number, sampleRate: number, options?: {
    fftSize?: number;
    minHz?: number;
    maxHz?: number;
    log?: boolean;
}): SpectrumLayout;
/**
 * The bin window one column covers.
 * @param column - column index, in `[0, columns)`.
 * @param layout - the axis layout.
 * @returns inclusive-exclusive bin range `[from, to)`.
 */
export declare function binRangeOfColumn(column: number, layout: SpectrumLayout): {
    from: number;
    to: number;
};
/**
 * Collapse analyser bins into one value per drawn column.
 * @param bins - `Uint8Array` straight from `getByteFrequencyData`.
 * @param layout - the axis layout.
 * @returns column magnitudes in 0..1.
 */
export declare function collapseSpectrum(bins: Uint8Array, layout: SpectrumLayout): Float32Array;
/**
 * The strongest bin in a frame.
 * @param bins - `Uint8Array` straight from `getByteFrequencyData`.
 * @param sampleRate - the AudioContext sample rate.
 * @param fftSize - the analyser's FFT size.
 * @returns the frequency of the loudest bin, in hertz (0 when silent).
 */
export declare function peakFrequency(bins: Uint8Array, sampleRate: number, fftSize: number): number;
/**
 * Frequency ruler labels across the axis.
 * @param layout - the axis layout.
 * @param width - canvas width in CSS pixels.
 * @returns ticks with their pixel offset and label.
 */
export declare function frequencyTicks(layout: SpectrumLayout, width: number): Array<{
    hz: number;
    x: number;
    label: string;
}>;
/**
 * Pixel offset of one frequency on the spectrum axis.
 * @param hz - frequency in hertz.
 * @param layout - the axis layout.
 * @param width - canvas width in CSS pixels.
 * @returns the pixel offset (clamped to the canvas).
 */
export declare function frequencyToX(hz: number, layout: SpectrumLayout, width: number): number;
/**
 * Frequency under a pixel on the spectrum axis.
 * @param x - pixel offset.
 * @param layout - the axis layout.
 * @param width - canvas width in CSS pixels.
 * @returns the frequency at that pixel.
 */
export declare function frequencyAtX(x: number, layout: SpectrumLayout, width: number): number;
