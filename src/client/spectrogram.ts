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

import type { ThemeVariant } from './theme.ts'
import { magnitudeColor } from './waterfall.ts'
import { analyzeFrame, hannWindow, isPowerOfTwo } from './fft.ts'

/** Transform size (1024 -> 512 bins). */
export const DEFAULT_FFT_SIZE = 1024

/** Default grid height when the caller has no pixel budget to give. */
export const DEFAULT_BANDS = 256

/** Highest grid height we will build (keeps a tall lane from exploding memory). */
export const MAX_BANDS = 512

/** Dynamic range mapped onto the byte grid. */
export const DEFAULT_RANGE_DB = 78

/** Frequency spacing of the axis. */
export type FrequencyScale = 'mel' | 'log' | 'linear'

/** How the grid is built. */
export interface SpectrogramOptions {
  /** Transform size (power of two). */
  fftSize?: number | undefined
  /** Grid width in columns. */
  columns?: number | undefined
  /** Grid height in bands. */
  bands?: number | undefined
  /** Lowest frequency shown, in hertz. */
  minHz?: number | undefined
  /** Highest frequency shown, in hertz (clamped to Nyquist). */
  maxHz?: number | undefined
  /** Frequency spacing. */
  scale?: FrequencyScale | undefined
  /** Dynamic range in dB mapped across the byte grid. */
  rangeDb?: number | undefined
}

/** A computed spectrogram over one time window. */
export interface Spectrogram {
  /** Time resolution. */
  columns: number
  /** Frequency resolution (row count). */
  bands: number
  /** Magnitudes 0..255, band-major with band 0 = lowest frequency. */
  data: Uint8Array
  /** Left edge of the analyzed window, in seconds. */
  startTime: number
  /** Right edge of the analyzed window, in seconds. */
  endTime: number
  /** Lowest frequency of band 0. */
  minHz: number
  /** Upper edge of the last band. */
  maxHz: number
  /** Frequency spacing used. */
  scale: FrequencyScale
}

/** The frequency window one band covers. */
export interface BandRange {
  /** Lower edge in hertz. */
  from: number
  /** Upper edge in hertz. */
  to: number
}

/**
 * Mel of a frequency (the classic 2595 * log10(1 + hz / 700) form).
 * @param hz - frequency in hertz.
 * @returns the mel value.
 */
export function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + Math.max(0, hz) / 700)
}

/**
 * Inverse of {@link hzToMel}.
 * @param mel - mel value.
 * @returns the frequency in hertz.
 */
export function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1)
}

/**
 * Frequency window covered by one band.
 * @param band - band index, 0 = lowest frequency.
 * @param bands - total band count.
 * @param minHz - axis lower bound.
 * @param maxHz - axis upper bound.
 * @param scale - frequency spacing.
 * @returns the band's frequency window.
 */
export function bandFrequencyRange(
  band: number,
  bands: number,
  minHz: number,
  maxHz: number,
  scale: FrequencyScale,
): BandRange {
  const count = Math.max(1, bands)
  const ratioFrom = band / count
  const ratioTo = (band + 1) / count
  if (scale === 'mel' && minHz > 0) {
    const low = hzToMel(minHz)
    const high = hzToMel(maxHz)
    return { from: melToHz(low + (high - low) * ratioFrom), to: melToHz(low + (high - low) * ratioTo) }
  }
  if (scale === 'log' && minHz > 0) {
    const span = maxHz / minHz
    return { from: minHz * Math.pow(span, ratioFrom), to: minHz * Math.pow(span, ratioTo) }
  }
  return { from: minHz + (maxHz - minHz) * ratioFrom, to: minHz + (maxHz - minHz) * ratioTo }
}

/**
 * Time at the centre of one column.
 * @param column - column index.
 * @param spec - the grid.
 * @returns seconds into the file.
 */
export function spectrogramColumnTime(column: number, spec: Spectrogram): number {
  const span = spec.endTime - spec.startTime
  return spec.startTime + ((column + 0.5) / Math.max(1, spec.columns)) * span
}

/**
 * Column index holding one instant.
 * @param time - seconds into the file.
 * @param spec - the grid.
 * @returns the column, clamped into range.
 */
export function spectrogramColumnAt(time: number, spec: Spectrogram): number {
  const span = spec.endTime - spec.startTime
  if (!Number.isFinite(time) || span <= 0) return 0
  const column = Math.floor(((time - spec.startTime) / span) * spec.columns)
  return Math.min(Math.max(column, 0), Math.max(0, spec.columns - 1))
}

/**
 * Read one cell back as a 0..1 magnitude.
 * @param spec - the grid.
 * @param column - time column.
 * @param band - frequency band (0 = lowest).
 * @returns the magnitude, or 0 outside the grid.
 */
export function spectrogramValueAt(spec: Spectrogram, column: number, band: number): number {
  if (column < 0 || band < 0 || column >= spec.columns || band >= spec.bands) return 0
  return (spec.data[band * spec.columns + column] ?? 0) / 255
}

/** Input for {@link computeSpectrogramWindow}. */
export interface SpectrogramWindowOptions extends SpectrogramOptions {
  /** Left edge of the window, in seconds. */
  startTime: number
  /** Right edge of the window, in seconds. */
  endTime: number
}

/** Below this level the input counts as silence (no normalization). */
const SILENT_DB = -100

/**
 * Compute the spectrogram of one time window.
 * @param mono - downmixed PCM of the whole file.
 * @param sampleRate - sample rate of `mono`.
 * @param options - window, resolution and axis settings.
 * @returns the grid, sized to the requested columns and bands.
 */
export function computeSpectrogramWindow(
  mono: Float32Array,
  sampleRate: number,
  options: SpectrogramWindowOptions,
): Spectrogram {
  const requestedFft = options.fftSize ?? DEFAULT_FFT_SIZE
  const fftSize = isPowerOfTwo(requestedFft) ? requestedFft : DEFAULT_FFT_SIZE
  const columns = Math.max(1, Math.floor(options.columns ?? 512))
  const bands = Math.max(1, Math.min(MAX_BANDS, Math.floor(options.bands ?? DEFAULT_BANDS)))
  const scale: FrequencyScale = options.scale ?? 'mel'
  const rangeDb = Math.max(6, options.rangeDb ?? DEFAULT_RANGE_DB)
  const nyquist = Math.max(sampleRate, 1) / 2
  const minHz = Math.max(0, Math.min(options.minHz ?? 30, nyquist))
  const maxHz = Math.max(minHz + 1, Math.min(options.maxHz ?? nyquist, nyquist))
  const startTime = Number.isFinite(options.startTime) ? Math.max(0, options.startTime) : 0
  const endTime = Number.isFinite(options.endTime) ? Math.max(startTime + 1e-6, options.endTime) : startTime + 1e-6
  const spec: Spectrogram = {
    columns,
    bands,
    data: new Uint8Array(columns * bands),
    startTime,
    endTime,
    minHz,
    maxHz,
    scale,
  }
  if (mono.length === 0) return spec

  const window = hannWindow(fftSize)
  const scratch = {
    re: new Float32Array(fftSize),
    im: new Float32Array(fftSize),
    magnitudes: new Float32Array(fftSize / 2),
  }
  const frame = new Float32Array(fftSize)
  const bins = fftSize / 2
  const binHz = sampleRate / fftSize
  const ranges: BandRange[] = []
  for (let band = 0; band < bands; band++) ranges.push(bandFrequencyRange(band, bands, minHz, maxHz, scale))
  const binOf = (hz: number): number => Math.min(bins, Math.max(0, Math.round(hz / binHz)))

  const span = endTime - startTime
  const half = fftSize >> 1
  const dbGrid = new Float32Array(columns * bands)
  let peakDb = -Infinity
  for (let column = 0; column < columns; column++) {
    const center = startTime + ((column + 0.5) / columns) * span
    const first = Math.round(center * sampleRate) - half
    for (let index = 0; index < fftSize; index++) {
      const source = first + index
      frame[index] = source >= 0 && source < mono.length ? (mono[source] ?? 0) : 0
    }
    const magnitudes = analyzeFrame(frame, window, scratch)
    for (let band = 0; band < bands; band++) {
      const range = ranges[band] ?? { from: minHz, to: maxHz }
      const from = binOf(range.from)
      const to = Math.max(from + 1, binOf(range.to))
      let peak = 0
      for (let bin = from; bin < to && bin < magnitudes.length; bin++) peak = Math.max(peak, magnitudes[bin] ?? 0)
      const db = 20 * Math.log10(peak / (fftSize / 4) + 1e-9)
      dbGrid[band * columns + column] = db
      if (db > peakDb) peakDb = db
    }
  }

  // Normalize against the loudest cell, and leave pure silence blank: scaling
  // a noise floor up to full brightness is the classic spectrogram bug.
  const floorDb = peakDb - rangeDb
  const usable = Number.isFinite(peakDb) && peakDb > SILENT_DB && peakDb - floorDb > 1
  if (usable) {
    for (let index = 0; index < dbGrid.length; index++) {
      const db = dbGrid[index] ?? -Infinity
      const scaled = Number.isFinite(db) ? (db - floorDb) / rangeDb : 0
      spec.data[index] = Math.round(Math.min(Math.max(scaled, 0), 1) * 255)
    }
  }
  return spec
}

/**
 * Compute the spectrogram of a whole file.
 * @param channels - decoded PCM per channel (mixed down internally).
 * @param sampleRate - the decoded sample rate.
 * @param duration - the decoded duration in seconds.
 * @param options - resolution and axis settings.
 * @returns the grid.
 */
export function computeSpectrogram(
  channels: readonly Float32Array[],
  sampleRate: number,
  duration: number,
  options: SpectrogramOptions = {},
): Spectrogram {
  const channelCount = Math.max(1, channels.length)
  const total = channels[0]?.length ?? 0
  const mono = new Float32Array(total)
  for (const channel of channels) {
    for (let index = 0; index < total; index++) mono[index] = (mono[index] ?? 0) + (channel[index] ?? 0) / channelCount
  }
  return computeSpectrogramWindow(mono, sampleRate, { ...options, startTime: 0, endTime: Math.max(duration, 1e-6) })
}

/**
 * Render the grid into an RGBA buffer, highest frequency on the top row.
 * @param spec - the grid.
 * @param out - destination of columns * bands * 4 bytes.
 * @param variant - active skin (the colour ramp inverts for a light one).
 * @returns the same buffer, filled.
 */
export function renderSpectrogramRgba(spec: Spectrogram, out: Uint8ClampedArray, variant: ThemeVariant = 'dark'): Uint8ClampedArray {
  const { columns, bands } = spec
  for (let band = 0; band < bands; band++) {
    const row = bands - 1 - band
    for (let column = 0; column < columns; column++) {
      const magnitude = (spec.data[band * columns + column] ?? 0) / 255
      const [r, g, b] = magnitudeColor(magnitude, variant)
      const offset = (row * columns + column) * 4
      out[offset] = r
      out[offset + 1] = g
      out[offset + 2] = b
      out[offset + 3] = 255
    }
  }
  return out
}
