/**
 * Byte fetching and decoding. Playback never decodes the whole file — the
 * `<audio>` element streams — so decoding exists only to produce the waveform
 * envelope, and the decoded `AudioBuffer` is dropped as soon as the (tiny)
 * peak arrays exist.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/decode
 */

import { computeChannelPeaks, type ChannelPeaks } from './peaks.ts'

/**
 * Files longer than this are streamed without decoding: the downmixed PCM the
 * waveform and the windowed spectrogram need costs about 176 KB per second of
 * audio, so this cap is what keeps a two-hour recording from taking the tab
 * down. Everything shorter is decoded automatically on open.
 */
export const MAX_DECODE_SECONDS = 1800

/** Envelope resolution: columns across the whole file. */
export const PEAK_COLUMNS = 4000

/** Everything the waveform needs from a decoded file. */
export interface DecodedAudio {
  /** Duration in seconds. */
  duration: number
  /** Sample rate of the decoded buffer. */
  sampleRate: number
  /** Channel count. */
  channels: number
  /** One envelope per channel. */
  peaks: ChannelPeaks[]
  /** Envelope resolution. */
  columns: number
  /**
   * Downmixed PCM of the whole file, kept so the spectrogram can be re-derived
   * for whatever window is on screen — that is what makes zooming sharp.
   */
  mono?: Float32Array | undefined
}

/** Progress reporting for the byte download. */
export interface FetchBytesOptions {
  /** Abort the download. */
  signal?: AbortSignal | undefined
  /** Called with each chunk (total is 0 when the server sends no length). */
  onProgress?: ((loaded: number, total: number) => void) | undefined
}

/**
 * Download a URL into memory.
 * @param url - the media URL.
 * @param options - abort signal and progress callback.
 * @returns the file bytes.
 * @throws {Error} on a non-OK response.
 */
export async function fetchBytes(url: string, options: FetchBytesOptions = {}): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal: options.signal, headers: { accept: 'audio/*' } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const total = Number(response.headers.get('content-length') ?? '0')
  const reader = response.body?.getReader()
  if (reader === undefined) return await response.arrayBuffer()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const chunk = await reader.read()
    if (chunk.done) break
    if (chunk.value !== undefined) {
      chunks.push(chunk.value)
      loaded += chunk.value.byteLength
      options.onProgress?.(loaded, Number.isFinite(total) ? total : 0)
    }
  }
  const merged = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged.buffer
}

/** Options for {@link decodeAudio}. */
export interface DecodeOptions {
  /** Envelope resolution. */
  columns?: number | undefined
  /** Build the decoding context (defaults to a throwaway OfflineAudioContext). */
  contextFactory?: (() => BaseAudioContext | null) | undefined
  /** Keep the downmixed PCM for windowed re-analysis (default true). */
  keepMono?: boolean | undefined
}

/** A decoding context, or null when the platform has none. */
function defaultDecodeContext(): BaseAudioContext | null {
  const scope = globalThis as {
    OfflineAudioContext?: new (channels: number, length: number, sampleRate: number) => BaseAudioContext
    AudioContext?: new () => BaseAudioContext
    webkitAudioContext?: new () => BaseAudioContext
  }
  if (scope.OfflineAudioContext !== undefined) return new scope.OfflineAudioContext(1, 1, 44100)
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext
  return Ctor === undefined ? null : new Ctor()
}

/**
 * Decode a file into per-channel envelopes.
 * @param data - the file bytes (consumed by `decodeAudioData`).
 * @param options - resolution and a decoding-context seam.
 * @returns duration, format info and envelopes.
 * @throws {Error} when Web Audio is unavailable or the bytes cannot be decoded.
 */
export async function decodeAudio(data: ArrayBuffer, options: DecodeOptions = {}): Promise<DecodedAudio> {
  const context = options.contextFactory?.() ?? defaultDecodeContext()
  if (context === null) throw new Error('Web Audio is unavailable')
  try {
    const buffer = await context.decodeAudioData(data)
    const columns = options.columns ?? PEAK_COLUMNS
    const peaks: ChannelPeaks[] = []
    const channelData: Float32Array[] = []
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const samples = buffer.getChannelData(channel)
      channelData.push(samples)
      peaks.push(computeChannelPeaks(samples, columns))
    }
    // One downmix, shared by the windowed spectrogram: half the memory of the
    // decoded stereo buffer and exactly what the STFT reads.
    const total = channelData[0]?.length ?? 0
    const mono = options.keepMono === false ? undefined : new Float32Array(total)
    if (mono !== undefined && total > 0) {
      const scale = 1 / Math.max(1, channelData.length)
      for (const samples of channelData) {
        for (let index = 0; index < total; index++) mono[index] = (mono[index] ?? 0) + (samples[index] ?? 0) * scale
      }
    }
    return {
      duration: buffer.duration,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
      peaks,
      columns,
      mono,
    }
  } finally {
    // `close` lives on the concrete contexts (AudioContext /
    // OfflineAudioContext), not on BaseAudioContext, and jsdom doubles
    // frequently lack it — closing is best-effort.
    const closable = context as BaseAudioContext & { close?: () => Promise<void> }
    if (typeof closable.close === 'function') {
      try {
        await closable.close()
      } catch {
        // Ignored on purpose.
      }
    }
  }
}
