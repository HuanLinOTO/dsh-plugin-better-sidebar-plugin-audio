import { describe, expect, it } from 'vitest'
import { computeChannelPeaks } from '../src/client/peaks.ts'
import { abRange, normalizeSelection, selectionStats, wrapInto } from '../src/client/selection.ts'
import { fullView } from '../src/client/view.ts'

const pcm = (values: number[]): Float32Array => Float32Array.from(values)

describe('normalizeSelection', () => {
  it('orders the endpoints', () => {
    expect(normalizeSelection(1, 3)).toEqual({ start: 1, end: 3 })
    expect(normalizeSelection(3, 1)).toEqual({ start: 1, end: 3 })
  })
})

describe('selectionStats', () => {
  // One column per second-of-eight, so a second maps onto exactly one column.
  const peaks = computeChannelPeaks(pcm([0, 0.5, 1, 1, 0.25, 0.25, 0, 0]), 8)
  const view = fullView(8)

  it('reads peak and length out of the covered columns', () => {
    const stats = selectionStats([peaks], { start: 4, end: 6 }, view, 8, 8)
    expect(stats.duration).toBeCloseTo(2, 6)
    expect(stats.peak).toBeCloseTo(0.25, 6)
    expect(stats.peakDb).toBeCloseTo(20 * Math.log10(0.25), 3)
    expect(stats.rmsDb).toBeLessThan(0)
    expect(stats.start).toBe(4)
    expect(stats.end).toBe(6)
  })

  it('reports a silent window as -120 dBFS', () => {
    const stats = selectionStats([peaks], { start: 0, end: 1 }, view, 8, 8)
    expect(stats.peak).toBe(0)
    expect(stats.peakDb).toBe(-120)
  })

  it('scales with the visible window', () => {
    // The same 0..2 s selection covers half the file when nothing is zoomed…
    expect(selectionStats([peaks], { start: 0, end: 2 }, view, 8, 8).peak).toBeCloseTo(0.5, 6)
    // …and the loudest part once the view is zoomed into the first half.
    expect(selectionStats([peaks], { start: 0, end: 2 }, { start: 0, end: 4 }, 8, 8).peak).toBeCloseTo(1, 6)
  })
})

describe('abRange', () => {
  it('is null without a selection', () => {
    expect(abRange(null)).toBeNull()
  })

  it('refuses a selection too short to loop', () => {
    expect(abRange({ start: 1, end: 1.001 })).toBeNull()
  })

  it('accepts a usable selection', () => {
    expect(abRange({ start: 1, end: 1.5 })).toEqual({ start: 1, end: 1.5 })
  })
})

describe('wrapInto', () => {
  it('keeps a position inside the window', () => {
    expect(wrapInto(1.2, { start: 1, end: 2 })).toBeCloseTo(1.2, 6)
  })

  it('wraps past the end and before the start', () => {
    expect(wrapInto(2.5, { start: 1, end: 2 })).toBe(1)
    expect(wrapInto(0.5, { start: 1, end: 2 })).toBe(1)
  })
})
