import { describe, expect, it } from 'vitest'
import { amplitudeToDb, computeChannelPeaks, emptyChannelPeaks, mixChannelPeaks, peaksWindowStats } from '../src/client/peaks.ts'

/** Build a Float32Array from a plain array (keeps the literals readable). */
const pcm = (values: number[]): Float32Array => Float32Array.from(values)

describe('computeChannelPeaks', () => {
  it('produces all-zero columns for an empty input', () => {
    const peaks = computeChannelPeaks(new Float32Array(0), 4)
    expect(peaks.min.length).toBe(4)
    expect(Array.from(peaks.max)).toEqual([0, 0, 0, 0])
    expect(Array.from(peaks.rms)).toEqual([0, 0, 0, 0])
  })

  it('always produces at least one column', () => {
    expect(computeChannelPeaks(pcm([1, -1]), 0).min.length).toBe(1)
  })

  it('buckets samples across the requested columns', () => {
    // 4 samples -> 2 columns: [0,1] and [2,3].
    const peaks = computeChannelPeaks(pcm([0, 1, -1, 0.5]), 2)
    expect(Array.from(peaks.max)).toEqual([1, 0.5])
    expect(Array.from(peaks.min)).toEqual([0, -1])
    expect(peaks.rms[0]).toBeCloseTo(Math.sqrt((0 + 1) / 2), 6)
    expect(peaks.rms[1]).toBeCloseTo(Math.sqrt((1 + 0.25) / 2), 6)
  })

  it('gives the last column the remainder when the split is uneven', () => {
    const peaks = computeChannelPeaks(pcm([1, 1, 1, 1, 1]), 2)
    // columns are [0,1] and [2,3,4]
    expect(peaks.max[0]).toBe(1)
    expect(peaks.rms[1]).toBe(1)
  })

  it('covers every sample when there are more columns than samples', () => {
    const peaks = computeChannelPeaks(pcm([0.5, -0.5]), 4)
    expect(peaks.max[3]).toBeCloseTo(-0 + 0, 6)
    expect(Array.from(peaks.max).filter(v => v === 0.5).length).toBe(1)
    expect(Array.from(peaks.min).filter(v => v === -0.5).length).toBe(1)
  })
})

describe('mixChannelPeaks', () => {
  it('returns an empty envelope without channels', () => {
    expect(mixChannelPeaks([]).min.length).toBe(0)
  })

  it('takes extremes across channels and combines RMS as a mean square', () => {
    const left = computeChannelPeaks(pcm([1, 0, 1, 0]), 2)
    const right = computeChannelPeaks(pcm([0, -1, 0, 0]), 2)
    const mixed = mixChannelPeaks([left, right])
    expect(mixed.max[0]).toBe(1)
    expect(mixed.min[0]).toBe(-1)
    expect(mixed.rms[0]).toBeCloseTo(Math.sqrt((Math.SQRT1_2 ** 2 + Math.SQRT1_2 ** 2) / 2), 6)
  })

  it('never reads louder than the loudest channel', () => {
    const quiet = computeChannelPeaks(pcm([0, 0, 0, 0]), 2)
    const loud = computeChannelPeaks(pcm([1, 1, 1, 1]), 2)
    const mixed = mixChannelPeaks([quiet, loud])
    expect(mixed.rms[0]).toBeCloseTo(Math.sqrt(1 / 2), 6)
    expect(mixed.rms[0]).toBeLessThanOrEqual(loud.rms[0] ?? 0)
  })
})

describe('amplitudeToDb', () => {
  it('maps full scale to 0 dBFS and halving to about -6 dB', () => {
    expect(amplitudeToDb(1)).toBeCloseTo(0, 6)
    expect(amplitudeToDb(0.5)).toBeCloseTo(-6.0206, 3)
    expect(amplitudeToDb(0)).toBe(-120)
    expect(amplitudeToDb(-1)).toBeCloseTo(0, 6)
  })
})

describe('peaksWindowStats', () => {
  it('returns the loudest sample of the covered columns', () => {
    const peaks = computeChannelPeaks(pcm([0.1, 0.2, 0.9, 0.3]), 4)
    const stats = peaksWindowStats([peaks], 2, 3)
    expect(stats.peak).toBeCloseTo(0.9, 6)
  })

  it('clamps a window that runs past the envelope', () => {
    const peaks = computeChannelPeaks(pcm([0.5, 0.5]), 2)
    const stats = peaksWindowStats([peaks], 1, 99)
    expect(stats.peak).toBeCloseTo(0.5, 6)
    expect(Number.isFinite(stats.rms)).toBe(true)
  })

  it('is silent for an empty envelope', () => {
    expect(peaksWindowStats([emptyChannelPeaks(0)], 0, 3)).toEqual({ peak: 0, rms: 0 })
  })
})
