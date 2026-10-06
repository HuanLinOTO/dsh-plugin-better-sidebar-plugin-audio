import { describe, expect, it } from 'vitest'
import {
  MIN_SPAN_SECONDS,
  clampView,
  formatHz,
  formatTime,
  fullView,
  panView,
  tickStep,
  ticks,
  timeAtX,
  xAtTime,
  zoomView,
} from '../src/client/view.ts'

describe('fullView', () => {
  it('spans the file', () => {
    expect(fullView(12.5)).toEqual({ start: 0, end: 12.5 })
  })

  it('never collapses to zero length', () => {
    expect(fullView(0).end).toBe(MIN_SPAN_SECONDS)
  })
})

describe('clampView', () => {
  it('keeps a valid window unchanged', () => {
    expect(clampView({ start: 1, end: 3 }, 10)).toEqual({ start: 1, end: 3 })
  })

  it('repairs an inverted or degenerate window', () => {
    expect(clampView({ start: 5, end: 5 }, 10)).toEqual({ start: 0, end: 10 })
    expect(clampView({ start: 8, end: 2 }, 10)).toEqual({ start: 0, end: 10 })
  })

  it('keeps the window inside the file', () => {
    expect(clampView({ start: 9, end: 19 }, 10)).toEqual({ start: 0, end: 10 })
    expect(clampView({ start: 12, end: 20 }, 10)).toEqual({ start: 2, end: 10 })
    expect(clampView({ start: -4, end: 0 }, 10)).toEqual({ start: 0, end: 4 })
  })

  it('never zooms tighter than the minimum span', () => {
    expect(clampView({ start: 1, end: 1.0001 }, 10).end - clampView({ start: 1, end: 1.0001 }, 10).start).toBeCloseTo(MIN_SPAN_SECONDS, 9)
  })

  it('allows a window shorter than the file when the file is tiny', () => {
    const view = clampView({ start: 0, end: 0.001 }, 0.001)
    expect(view.end - view.start).toBeCloseTo(Math.max(0.001, 0), 9)
  })

  it('survives NaN input', () => {
    expect(clampView({ start: Number.NaN, end: Number.NaN }, 4)).toEqual({ start: 0, end: 4 })
  })
})

describe('zoomView', () => {
  it('keeps the focus time under the same pixel', () => {
    const view = { start: 0, end: 10 }
    const zoomed = zoomView(view, 5, 0.5, 10)
    expect(zoomed.end - zoomed.start).toBeCloseTo(5, 6)
    expect((5 - zoomed.start) / (zoomed.end - zoomed.start)).toBeCloseTo(0.5, 6)
  })

  it('zooms out around the focus and clamps at the file bounds', () => {
    // 2 s wide, focus in the middle, ×4 -> 8 s wide, still centred on 5 s.
    expect(zoomView({ start: 4, end: 6 }, 5, 4, 10)).toEqual({ start: 1, end: 9 })
    // Hitting an edge slides the window back inside the file.
    expect(zoomView({ start: 0, end: 2 }, 0, 4, 10)).toEqual({ start: 0, end: 8 })
  })

  it('stops at the minimum span', () => {
    const zoomed = zoomView({ start: 0, end: 10 }, 3, 1e-6, 10)
    expect(zoomed.end - zoomed.start).toBeCloseTo(MIN_SPAN_SECONDS, 9)
  })
})

describe('panView', () => {
  it('moves the window without resizing it', () => {
    expect(panView({ start: 1, end: 3 }, 2, 10)).toEqual({ start: 3, end: 5 })
  })

  it('stops at the edges', () => {
    expect(panView({ start: 1, end: 3 }, -5, 10)).toEqual({ start: 0, end: 2 })
    expect(panView({ start: 1, end: 3 }, 50, 10)).toEqual({ start: 8, end: 10 })
  })
})

describe('time <-> pixel mapping', () => {
  it('round-trips', () => {
    const view = { start: 2, end: 6 }
    const x = xAtTime(view, 4, 800)
    expect(x).toBeCloseTo(400, 6)
    expect(timeAtX(view, x, 800)).toBeCloseTo(4, 6)
  })

  it('degrades safely on a zero-width canvas', () => {
    const view = { start: 2, end: 6 }
    expect(timeAtX(view, 10, 0)).toBe(2)
    expect(xAtTime(view, 3, 0)).toBe(0)
  })
})

describe('tickStep / ticks', () => {
  it('picks a step that keeps labels apart', () => {
    expect(tickStep(10, 200)).toBe(5)
    expect(tickStep(3600, 900)).toBe(300)
    expect(tickStep(0.5, 600)).toBe(0.1)
  })

  it('lists ticks inside the window in ascending order', () => {
    const list = ticks({ start: 0, end: 10 }, 600)
    expect(list[0]).toBe(0)
    expect(list).toContain(10)
    expect([...list].sort((a, b) => a - b)).toEqual(list)
  })

  it('never emits an unbounded list', () => {
    expect(ticks({ start: 0, end: 100000 }, 600).length).toBeLessThanOrEqual(512)
  })
})

describe('formatTime', () => {
  it('formats minutes and hours', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(9.9)).toBe('0:09')
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(3661)).toBe('1:01:01')
  })

  it('adds milliseconds on request', () => {
    expect(formatTime(3.25, true)).toBe('0:03.250')
  })

  it('clamps junk to zero', () => {
    expect(formatTime(-5)).toBe('0:00')
    expect(formatTime(Number.NaN)).toBe('0:00')
  })
})

describe('formatHz', () => {
  it('switches to kilohertz above 1000', () => {
    expect(formatHz(0)).toBe('0 Hz')
    expect(formatHz(440.4)).toBe('440 Hz')
    expect(formatHz(1200)).toBe('1.20 kHz')
    expect(formatHz(12000)).toBe('12.0 kHz')
  })
})
