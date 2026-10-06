/**
 * A small radix-2 FFT, written here rather than pulled in as a dependency: the
 * spectrogram needs exactly one transform (power-of-two, real input, power
 * spectrum), and the plugin must stay dependency-free.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/fft
 */
/**
 * Whether a length is a power of two.
 * @param value - candidate length.
 * @returns true for 1, 2, 4, 8, …
 */
export declare function isPowerOfTwo(value: number): boolean;
/**
 * Iterative in-place radix-2 FFT (Cooley–Tukey, decimation in time).
 * @param re - real parts, length must be a power of two.
 * @param im - imaginary parts, same length as `re`.
 * @throws {Error} when the lengths differ or are not a power of two.
 */
export declare function fftInPlace(re: Float32Array, im: Float32Array): void;
/**
 * A periodic Hann window.
 * @param size - window length in samples.
 * @returns the window (zero-length input yields a zero-length window).
 */
export declare function hannWindow(size: number): Float32Array;
/**
 * Power spectrum of a transformed frame (the first half of the bins).
 * @param re - transformed real parts.
 * @param im - transformed imaginary parts.
 * @param out - optional destination (reused across frames).
 * @returns magnitudes, one per bin below Nyquist.
 */
export declare function magnitudes(re: Float32Array, im: Float32Array, out?: Float32Array): Float32Array;
/**
 * Analyze one frame of samples into its power spectrum.
 * @param samples - source samples (short frames are zero-padded).
 * @param window - windowing function; pass undefined for a rectangular window.
 * @param scratch - reusable buffers (same layout as the transform length).
 * @returns the magnitudes, one per bin below Nyquist.
 */
export declare function analyzeFrame(samples: Float32Array, window: Float32Array | undefined, scratch: {
    re: Float32Array;
    im: Float32Array;
    magnitudes: Float32Array;
}): Float32Array;
