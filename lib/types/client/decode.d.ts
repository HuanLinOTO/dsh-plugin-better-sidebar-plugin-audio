/**
 * Byte fetching and decoding. Playback never decodes the whole file — the
 * `<audio>` element streams — so decoding exists only to produce the waveform
 * envelope, and the decoded `AudioBuffer` is dropped as soon as the (tiny)
 * peak arrays exist.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/decode
 */
import { type ChannelPeaks } from './peaks.ts';
/**
 * Files longer than this are streamed without decoding: the downmixed PCM the
 * waveform and the windowed spectrogram need costs about 176 KB per second of
 * audio, so this cap is what keeps a two-hour recording from taking the tab
 * down. Everything shorter is decoded automatically on open.
 */
export declare const MAX_DECODE_SECONDS = 1800;
/** Envelope resolution: columns across the whole file. */
export declare const PEAK_COLUMNS = 4000;
/** Everything the waveform needs from a decoded file. */
export interface DecodedAudio {
    /** Duration in seconds. */
    duration: number;
    /** Sample rate of the decoded buffer. */
    sampleRate: number;
    /** Channel count. */
    channels: number;
    /** One envelope per channel. */
    peaks: ChannelPeaks[];
    /** Envelope resolution. */
    columns: number;
    /**
     * Downmixed PCM of the whole file, kept so the spectrogram can be re-derived
     * for whatever window is on screen — that is what makes zooming sharp.
     */
    mono?: Float32Array | undefined;
}
/** Progress reporting for the byte download. */
export interface FetchBytesOptions {
    /** Abort the download. */
    signal?: AbortSignal | undefined;
    /** Called with each chunk (total is 0 when the server sends no length). */
    onProgress?: ((loaded: number, total: number) => void) | undefined;
}
/**
 * Download a URL into memory.
 * @param url - the media URL.
 * @param options - abort signal and progress callback.
 * @returns the file bytes.
 * @throws {Error} on a non-OK response.
 */
export declare function fetchBytes(url: string, options?: FetchBytesOptions): Promise<ArrayBuffer>;
/** Options for {@link decodeAudio}. */
export interface DecodeOptions {
    /** Envelope resolution. */
    columns?: number | undefined;
    /** Build the decoding context (defaults to a throwaway OfflineAudioContext). */
    contextFactory?: (() => BaseAudioContext | null) | undefined;
    /** Keep the downmixed PCM for windowed re-analysis (default true). */
    keepMono?: boolean | undefined;
}
/**
 * Decode a file into per-channel envelopes.
 * @param data - the file bytes (consumed by `decodeAudioData`).
 * @param options - resolution and a decoding-context seam.
 * @returns duration, format info and envelopes.
 * @throws {Error} when Web Audio is unavailable or the bytes cannot be decoded.
 */
export declare function decodeAudio(data: ArrayBuffer, options?: DecodeOptions): Promise<DecodedAudio>;
