/**
 * Waveform envelope computation: turn raw PCM into a fixed number of display
 * columns. This is the only place sample data is touched, and it runs once per
 * file — the decoded `AudioBuffer` is dropped right after (playback streams
 * through the `<audio>` element), so peak arrays are all the viewer keeps.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/peaks
 */
/** Per-channel envelope of one file: `columns` buckets of min/max/RMS. */
export interface ChannelPeaks {
    /** Lowest sample per column (<= 0). */
    min: Float32Array;
    /** Highest sample per column (>= 0). */
    max: Float32Array;
    /** Root-mean-square per column, in 0..1. */
    rms: Float32Array;
}
/** An empty envelope (used before decoding and for zero-length files). */
export declare function emptyChannelPeaks(columns?: number): ChannelPeaks;
/**
 * Bucket one channel's samples into display columns.
 * @param samples - normalized PCM in -1..1.
 * @param columns - number of display columns (>= 1).
 * @returns min/max/RMS per column; an empty file yields all-zero columns.
 */
export declare function computeChannelPeaks(samples: Float32Array, columns: number): ChannelPeaks;
/**
 * Combine several channels into the "mix" envelope.
 * @param channels - per-channel envelopes of equal column count.
 * @returns min/max as the extremes across channels, RMS as the root of the
 *   mean square (so the mix never reads louder than its loudest channel).
 */
export declare function mixChannelPeaks(channels: readonly ChannelPeaks[]): ChannelPeaks;
/**
 * Amplitude to dBFS.
 * @param value - linear amplitude in 0..1.
 * @returns dBFS, floored at about -120.
 */
export declare function amplitudeToDb(value: number): number;
/**
 * Envelope statistics over a column window (used by the selection read-out).
 * @param channels - envelopes to read.
 * @param fromColumn - first column of the window (inclusive).
 * @param toColumn - last column of the window (inclusive).
 * @returns the loudest sample and the mean RMS across the window.
 */
export declare function peaksWindowStats(channels: readonly ChannelPeaks[], fromColumn: number, toColumn: number): {
    peak: number;
    rms: number;
};
