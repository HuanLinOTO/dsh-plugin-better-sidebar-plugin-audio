import { describe, expect, it } from 'vitest'
import {
  FFT_SIZE,
  binRangeOfColumn,
  collapseSpectrum,
  frequencyAtX,
  frequencyTicks,
  frequencyToX,
  peakFrequency,
  spectrumLayout,
} from '../src/client/spectrum.ts'

const bins = (values: number[]): Uint8Array => Uint8Array.from(values)

describe('spectrumLayout', () => {
  it('clamps the axis to the Nyquist frequency', () => {
    const layout = spectrumLayout(100, 44100, { minHz: 20, maxHz: 40000 })
    expect(layout.maxHz).toBe(22050)
    expect(layout.minHz).toBe(20)
    expect(layout.columns).toBe(100)
  })

  it('always yields at least one column and a min < max axis', () => {
    const layout = spectrumLayout(0, 8000, { minHz: 100, maxHz: 100 })
    expect(layout.columns).toBe(1)
    expect(layout.maxHz).toBeGreaterThan(layout.minHz)
  })
})

describe('binRangeOfColumn', () => {
  it('stays inside the bin array and never returns an empty range', () => {
    const layout = spectrumLayout(64, 44100, {})
    const last = layout.fftSize / 2 - 1
    for (let column = 0; column < layout.columns; column++) {
      const range = binRangeOfColumn(column, layout)
      expect(range.from).toBeGreaterThanOrEqual(0)
      expect(range.to).toBeGreaterThan(range.from)
      expect(range.to).toBeLessThanOrEqual(last + 1)
    }
  })

  it('moves monotonically for both spacings', () => {
    for (const log of [true, false]) {
      const layout = spectrumLayout(32, 44100, { log })
      let previous = -1
      for (let column = 0; column < layout.columns; column++) {
        const { from } = binRangeOfColumn(column, layout)
        expect(from).toBeGreaterThanOrEqual(previous)
        previous = from
      }
    }
  })
})

describe('collapseSpectrum', () => {
  it('takes the loudest bin of each column, scaled to 0..1', () => {
    // fftSize 16 -> 8 bins, so the hand-written frame lines up with the axis.
    const layout = spectrumLayout(4, 8000, { fftSize: 16, minHz: 100, maxHz: 4000, log: false })
    const values = collapseSpectrum(bins([0, 128, 255, 64, 32, 16, 8, 4]), layout)
    expect(values.length).toBe(4)
    expect(Math.max(...values)).toBeCloseTo(1, 6)
    // Column 0 spans bins 0..2, so it reports the loudest of them (255).
    expect(values[0]).toBeCloseTo(1, 6)
  })

  it('reports the loudest bin of the covered window, not the first', () => {
    const layout = spectrumLayout(1, 8000, { fftSize: 16, minHz: 0, maxHz: 4000, log: false })
    const values = collapseSpectrum(bins([1, 2, 3, 4, 5, 6, 7, 200]), layout)
    expect(values[0]).toBeCloseTo(200 / 255, 6)
  })

  it('is silent for silent input', () => {
    const layout = spectrumLayout(8, 44100, {})
    expect(Array.from(collapseSpectrum(new Uint8Array(1024), layout))).toEqual(new Array(8).fill(0))
  })

  it('pads a short bin array instead of throwing', () => {
    const layout = spectrumLayout(4, 44100, {})
    expect(() => collapseSpectrum(bins([10, 20]), layout)).not.toThrow()
  })
})

describe('peakFrequency', () => {
  it('is zero for silence', () => {
    expect(peakFrequency(new Uint8Array(1024), 44100, FFT_SIZE)).toBe(0)
  })

  it('reports the frequency of the loudest bin', () => {
    const frame = new Uint8Array(1024)
    frame[43] = 200
    expect(peakFrequency(frame, 44100, FFT_SIZE)).toBeCloseTo((43 * 44100) / FFT_SIZE, 6)
  })

  it('skips the DC bin when a real peak exists', () => {
    const frame = new Uint8Array(64)
    frame[0] = 10
    frame[16] = 99
    expect(peakFrequency(frame, 8000, 128)).toBeCloseTo((16 * 8000) / 128, 6)
  })
})

describe('frequency axis mapping', () => {
  it('round-trips a frequency through its pixel', () => {
    const layout = spectrumLayout(400, 44100, {})
    for (const hz of [50, 200, 1000, 5000, 15000]) {
      const x = frequencyToX(hz, layout, 400)
      expect(frequencyAtX(x, layout, 400)).toBeCloseTo(hz, 3)
    }
  })

  it('lists only ticks inside the axis', () => {
    const layout = spectrumLayout(400, 44100, { minHz: 100, maxHz: 5000 })
    const list = frequencyTicks(layout, 400)
    expect(list.map(t => t.hz)).toEqual([100, 200, 500, 1000, 2000, 5000])
    expect(list[0]?.label).toBe('100')
    expect(list[3]?.label).toBe('1k')
    for (const tick of list) expect(tick.x).toBeGreaterThanOrEqual(0)
  })
})
