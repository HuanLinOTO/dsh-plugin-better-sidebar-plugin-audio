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
  min: Float32Array
  /** Highest sample per column (>= 0). */
  max: Float32Array
  /** Root-mean-square per column, in 0..1. */
  rms: Float32Array
}

/** An empty envelope (used before decoding and for zero-length files). */
export function emptyChannelPeaks(columns = 0): ChannelPeaks {
  return { min: new Float32Array(columns), max: new Float32Array(columns), rms: new Float32Array(columns) }
}

/**
 * Bucket one channel's samples into display columns.
 * @param samples - normalized PCM in -1..1.
 * @param columns - number of display columns (>= 1).
 * @returns min/max/RMS per column; an empty file yields all-zero columns.
 */
export function computeChannelPeaks(samples: Float32Array, columns: number): ChannelPeaks {
  const count = Math.max(1, Math.floor(columns))
  const min = new Float32Array(count)
  const max = new Float32Array(count)
  const rms = new Float32Array(count)
  const total = samples.length
  for (let column = 0; column < count; column++) {
    const from = Math.floor((column * total) / count)
    const to = column === count - 1 ? total : Math.floor(((column + 1) * total) / count)
    let low = 0
    let high = 0
    let sum = 0
    let seen = 0
    for (let index = from; index < to; index++) {
      const value = samples[index] ?? 0
      if (value < low) low = value
      if (value > high) high = value
      sum += value * value
      seen += 1
    }
    min[column] = low
    max[column] = high
    rms[column] = seen === 0 ? 0 : Math.sqrt(sum / seen)
  }
  return { min, max, rms }
}

/**
 * Combine several channels into the "mix" envelope.
 * @param channels - per-channel envelopes of equal column count.
 * @returns min/max as the extremes across channels, RMS as the root of the
 *   mean square (so the mix never reads louder than its loudest channel).
 */
export function mixChannelPeaks(channels: readonly ChannelPeaks[]): ChannelPeaks {
  const first = channels[0]
  if (first === undefined) return emptyChannelPeaks()
  const count = first.min.length
  const min = new Float32Array(count)
  const max = new Float32Array(count)
  const rms = new Float32Array(count)
  for (let column = 0; column < count; column++) {
    let low = 0
    let high = 0
    let sum = 0
    for (const channel of channels) {
      low = Math.min(low, channel.min[column] ?? 0)
      high = Math.max(high, channel.max[column] ?? 0)
      const value = channel.rms[column] ?? 0
      sum += value * value
    }
    min[column] = low
    max[column] = high
    rms[column] = Math.sqrt(sum / channels.length)
  }
  return { min, max, rms }
}

/** Smallest magnitude that still has a finite dB value (about -120 dBFS). */
const DB_FLOOR = 1e-6

/**
 * Amplitude to dBFS.
 * @param value - linear amplitude in 0..1.
 * @returns dBFS, floored at about -120.
 */
export function amplitudeToDb(value: number): number {
  return 20 * Math.log10(Math.max(Math.abs(value), DB_FLOOR))
}

/**
 * Envelope statistics over a column window (used by the selection read-out).
 * @param channels - envelopes to read.
 * @param fromColumn - first column of the window (inclusive).
 * @param toColumn - last column of the window (inclusive).
 * @returns the loudest sample and the mean RMS across the window.
 */
export function peaksWindowStats(
  channels: readonly ChannelPeaks[],
  fromColumn: number,
  toColumn: number,
): { peak: number; rms: number } {
  const first = channels[0]
  if (first === undefined) return { peak: 0, rms: 0 }
  const last = first.min.length - 1
  const from = Math.max(0, Math.min(Math.floor(fromColumn), Math.max(last, 0)))
  const to = Math.max(from, Math.min(Math.floor(toColumn), Math.max(last, 0)))
  let peak = 0
  let sum = 0
  let columns = 0
  for (let column = from; column <= to; column++) {
    let columnRms = 0
    for (const channel of channels) {
      peak = Math.max(peak, Math.abs(channel.min[column] ?? 0), Math.abs(channel.max[column] ?? 0))
      const value = channel.rms[column] ?? 0
      columnRms += value * value
    }
    sum += columnRms / Math.max(1, channels.length)
    columns += 1
  }
  return { peak, rms: columns === 0 ? 0 : Math.sqrt(sum / columns) }
}
