import { describe, expect, it } from 'vitest'
import {
  bandFrequencyRange,
  computeSpectrogram,
  computeSpectrogramWindow,
  hzToMel,
  melToHz,
  renderSpectrogramRgba,
  spectrogramColumnAt,
  spectrogramColumnTime,
  spectrogramValueAt,
  type Spectrogram,
} from '../src/client/spectrogram.ts'

/** A mono sine wave. */
function sine(sampleRate: number, seconds: number, hz: number): Float32Array {
  const total = Math.floor(sampleRate * seconds)
  const out = new Float32Array(total)
  for (let index = 0; index < total; index++) out[index] = Math.sin((2 * Math.PI * hz * index) / sampleRate)
  return out
}

/** Index of the band containing one frequency. */
function bandOf(hz: number, spec: Spectrogram): number {
  for (let band = 0; band < spec.bands; band++) {
    const range = bandFrequencyRange(band, spec.bands, spec.minHz, spec.maxHz, spec.scale)
    if (hz >= range.from && hz < range.to) return band
  }
  return -1
}

/** The loudest band of one column. */
function loudestBand(spec: Spectrogram, column: number): number {
  let best = 0
  for (let band = 1; band < spec.bands; band++) {
    if (spectrogramValueAt(spec, column, band) > spectrogramValueAt(spec, column, best)) best = band
  }
  return best
}

describe('mel scale', () => {
  it('round-trips a frequency', () => {
    for (const hz of [20, 100, 440, 1000, 8000]) {
      expect(melToHz(hzToMel(hz))).toBeCloseTo(hz, 6)
    }
  })

  it('is roughly linear down low and compressive up high', () => {
    const lowSlope = (hzToMel(200) - hzToMel(100)) / 100
    const highSlope = (hzToMel(8000) - hzToMel(7000)) / 1000
    expect(lowSlope).toBeGreaterThan(highSlope)
  })
})

describe('bandFrequencyRange', () => {
  it('splits evenly on a linear axis', () => {
    expect(bandFrequencyRange(0, 4, 100, 500, 'linear')).toEqual({ from: 100, to: 200 })
    expect(bandFrequencyRange(3, 4, 100, 500, 'linear')).toEqual({ from: 400, to: 500 })
  })

  it('gives the low bands a narrower window on a mel axis', () => {
    const low = bandFrequencyRange(0, 16, 30, 20000, 'mel')
    const high = bandFrequencyRange(15, 16, 30, 20000, 'mel')
    expect(low.to - low.from).toBeLessThan(high.to - high.from)
    expect(low.from).toBeCloseTo(30, 6)
    expect(high.to).toBeCloseTo(20000, 0)
  })

  it('also works on a log axis and falls back when the axis starts at zero', () => {
    const low = bandFrequencyRange(0, 8, 30, 20000, 'log')
    const high = bandFrequencyRange(7, 8, 30, 20000, 'log')
    expect(low.to - low.from).toBeLessThan(high.to - high.from)
    expect(bandFrequencyRange(0, 2, 0, 1000, 'mel')).toEqual({ from: 0, to: 500 })
  })
})

describe('windowed spectrogram', () => {
  const base = { startTime: 0, endTime: 1, columns: 32, bands: 96 } as const

  it('puts a 440 Hz tone in the band holding 440 Hz', () => {
    const spec = computeSpectrogramWindow(sine(8000, 1, 440), 8000, base)
    const band = loudestBand(spec, 16)
    const range = bandFrequencyRange(band, spec.bands, spec.minHz, spec.maxHz, spec.scale)
    expect(range.to).toBeGreaterThan(400)
    expect(range.from).toBeLessThan(500)
  })

  it('puts a 2 kHz tone above a 200 Hz tone', () => {
    const low = computeSpectrogramWindow(sine(8000, 1, 200), 8000, base)
    const high = computeSpectrogramWindow(sine(8000, 1, 2000), 8000, base)
    expect(loudestBand(high, 4)).toBeGreaterThan(loudestBand(low, 4))
  })

  it('reports the window it analyzed', () => {
    const spec = computeSpectrogramWindow(sine(8000, 4, 440), 8000, { startTime: 1, endTime: 2, columns: 16, bands: 32 })
    expect(spec.startTime).toBe(1)
    expect(spec.endTime).toBe(2)
    expect(spec.columns).toBe(16)
    expect(spec.bands).toBe(32)
    expect(spec.data.length).toBe(16 * 32)
    expect(spec.scale).toBe('mel')
    expect(loudestBand(spec, 8)).toBeGreaterThan(0)
  })

  it('resolves far more detail for a narrower window at the same column count', () => {
    const mono = sine(8000, 4, 440)
    const wide = computeSpectrogramWindow(mono, 8000, { startTime: 0, endTime: 4, columns: 64, bands: 64 })
    const narrow = computeSpectrogramWindow(mono, 8000, { startTime: 1, endTime: 1.5, columns: 64, bands: 64 })
    const wideStep = (wide.endTime - wide.startTime) / wide.columns
    const narrowStep = (narrow.endTime - narrow.startTime) / narrow.columns
    expect(narrowStep).toBeLessThan(wideStep / 4)
  })

  it('is silent for silence and survives an empty buffer', () => {
    expect(computeSpectrogramWindow(new Float32Array(8000), 8000, base).data.every(value => value === 0)).toBe(true)
    expect(computeSpectrogramWindow(new Float32Array(0), 8000, base).data.every(value => value === 0)).toBe(true)
  })

  it('refuses a nonsensical window without throwing', () => {
    const spec = computeSpectrogramWindow(sine(8000, 1, 440), 8000, { startTime: 2, endTime: 1, columns: 8, bands: 8 })
    expect(spec.endTime).toBeGreaterThanOrEqual(spec.startTime)
    expect(spec.data.length).toBe(64)
  })
})

describe('whole-file wrapper', () => {
  it('mixes channels down and spans the file', () => {
    const spec = computeSpectrogram([sine(8000, 2, 440), sine(8000, 2, 440)], 8000, 2, { columns: 20, bands: 40 })
    expect(spec.startTime).toBe(0)
    expect(spec.endTime).toBe(2)
    expect(spec.columns).toBe(20)
    expect(loudestBand(spec, 1)).toBeGreaterThan(0)
  })
})

describe('column mapping', () => {
  const spec: Spectrogram = {
    columns: 10,
    bands: 2,
    data: new Uint8Array(20),
    startTime: 2,
    endTime: 12,
    minHz: 0,
    maxHz: 100,
    scale: 'linear',
  }

  it('maps a time to its column and back', () => {
    expect(spectrogramColumnAt(2, spec)).toBe(0)
    expect(spectrogramColumnAt(7, spec)).toBe(5)
    expect(spectrogramColumnAt(12, spec)).toBe(9)
    expect(spectrogramColumnAt(-5, spec)).toBe(0)
    expect(spectrogramColumnTime(0, spec)).toBeCloseTo(2.5, 6)
    expect(spectrogramColumnTime(9, spec)).toBeCloseTo(11.5, 6)
  })

  it('reads outside the grid as silence', () => {
    expect(spectrogramValueAt(spec, -1, 0)).toBe(0)
    expect(spectrogramValueAt(spec, 0, 5)).toBe(0)
    expect(bandOf(50, spec)).toBeGreaterThanOrEqual(0)
  })
})

describe('renderSpectrogramRgba', () => {
  const spec: Spectrogram = {
    columns: 1,
    bands: 4,
    data: Uint8Array.from([0, 0, 0, 255]),
    startTime: 0,
    endTime: 1,
    minHz: 100,
    maxHz: 1000,
    scale: 'mel',
  }

  it('writes opaque RGBA of the right size', () => {
    const out = new Uint8ClampedArray(16)
    renderSpectrogramRgba(spec, out)
    for (let index = 0; index < 4; index++) expect(out[index * 4 + 3]).toBe(255)
  })

  it('draws the highest band on the top row', () => {
    const out = new Uint8ClampedArray(16)
    renderSpectrogramRgba(spec, out)
    expect(out[0] ?? 0).toBeGreaterThan(out[12] ?? 0)
  })

  it('inverts the ramp for a light skin', () => {
    const out = new Uint8ClampedArray(16)
    renderSpectrogramRgba(spec, out, 'light')
    expect(out[0] ?? 0).toBeLessThan(out[12] ?? 0)
  })
})
