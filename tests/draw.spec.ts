import { describe, expect, it } from 'vitest'
import { drawWaveform } from '../src/client/draw.ts'
import { emptyChannelPeaks, type ChannelPeaks } from '../src/client/peaks.ts'
import { DARK_FALLBACK } from '../src/client/theme.ts'

/**
 * A recording 2d-context double: it records fillRect calls together with the
 * fillStyle in force, so a test can tell the two waveform layers apart by
 * colour as well as by geometry.
 *
 * The lane paints one 1px-wide rect per canvas column for the peak band and one
 * more for the RMS core. Assertions read a column's peak through the band's
 * HEIGHT: a filled band spans the column's whole [min, max] range, which is
 * exactly what keeps a transient joined to the body instead of floating as a
 * dot of its own.
 */
interface Rect { x: number; y: number; w: number; h: number; fill: string }

function fakeContext(): { g: CanvasRenderingContext2D; rects: Rect[] } {
  const rects: Rect[] = []
  let fill = ''
  const g = {
    clearRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    closePath: () => {},
    setLineDash: () => {},
    measureText: () => ({ width: 10 }) as TextMetrics,
    fillText: () => {},
    putImageData: () => {},
    drawImage: () => {},
    get fillStyle(): string { return fill },
    set fillStyle(value: string) { fill = value },
    fillRect: (x: number, y: number, w: number, h: number) => { rects.push({ x, y, w, h, fill }) },
  }
  return { g: g as unknown as CanvasRenderingContext2D, rects }
}

/** Envelope with `columns` columns: loud (loud) up to splitAt, silent after. */
function splitPeaks(columns: number, splitAt: number, loud = 1): ChannelPeaks {
  const peaks = emptyChannelPeaks(columns)
  for (let column = 0; column < splitAt; column++) {
    peaks.min[column] = -loud
    peaks.max[column] = loud
    peaks.rms[column] = loud * 0.5
  }
  return peaks
}

/** Waveform-paint helper. */
function paint(view: { start: number; end: number }, duration: number, peaks: ChannelPeaks, peaksStart = 0) {
  return {
    width: 100,
    height: 40,
    view,
    duration,
    peaksStart,
    peaks,
    showRms: false,
    playhead: null,
    selection: null,
    colors: DARK_FALLBACK,
  }
}

/** Sum of the per-column values over a range of canvas columns. */
function summarize(values: number[], from: number, to: number): number {
  let sum = 0
  for (let index = from; index < to; index++) sum += values[index] ?? 0
  return sum
}

/** Tallest rect painted in each canvas column (the peak band, when present). */
function perColumn(rects: Rect[], width: number, fill?: string): number[] {
  const out = new Array<number>(width).fill(0)
  for (const rect of rects) {
    if (fill !== undefined && rect.fill !== fill) continue
    const column = Math.round(rect.x)
    out[column] = Math.max(out[column] ?? 0, rect.h)
  }
  return out
}

describe('drawWaveform window mapping', () => {
  // 10 s file, 40 envelope columns: loud 0-5 s, silent 5-10 s. A silent column
  // collapses onto the zero axis, so "silent" reads as a 1px band.
  const peaks = splitPeaks(40, 20)

  it('shows the loud half on the left at full view', () => {
    const { g, rects } = fakeContext()
    drawWaveform(g, paint({ start: 0, end: 10 }, 10, peaks))
    const values = perColumn(rects, 100)
    expect(summarize(values, 0, 45)).toBeGreaterThan(45 * 20)
    expect(summarize(values, 55, 100)).toBeLessThan(55 * 3)
  })

  it('crops the envelope when the window zooms into the silent half', () => {
    const { g, rects } = fakeContext()
    drawWaveform(g, paint({ start: 5, end: 10 }, 10, peaks))
    const values = perColumn(rects, 100)
    // Under the old width-based mapping the loud half still occupied the left
    // half of the canvas, i.e. zoom changed nothing but the grid.
    expect(summarize(values, 0, 100)).toBeLessThan(100 * 3)
  })

  it('stretches the loud half across the whole lane when zooming into it', () => {
    const { g, rects } = fakeContext()
    drawWaveform(g, paint({ start: 0, end: 5 }, 10, peaks))
    const values = perColumn(rects, 100)
    expect(summarize(values, 0, 45)).toBeGreaterThan(45 * 20)
    expect(summarize(values, 55, 100)).toBeGreaterThan(45 * 20)
  })

  it('maps a window envelope (origin = window start) across the whole lane', () => {
    const { g, rects } = fakeContext()
    // A re-derived envelope for the window 5-10 s that found content there: its
    // columns start at the window start, not at time zero.
    drawWaveform(g, paint({ start: 5, end: 10 }, 5, splitPeaks(40, 40, 0.8), 5))
    const values = perColumn(rects, 100)
    expect(summarize(values, 0, 100)).toBeGreaterThan(100 * 20)
  })
})

describe('drawWaveform layers', () => {
  const peaks = splitPeaks(40, 20)

  it('fills one continuous peak band per column, never a pair of loose dots', () => {
    // Regression: an outline of two bare pixels per column leaves every
    // transient disconnected from the body, and an end-to-end view fills up
    // with scattered dots. The band must span the column's whole range.
    const { g, rects } = fakeContext()
    drawWaveform(g, paint({ start: 0, end: 10 }, 10, peaks))
    expect(rects).toHaveLength(100)
    expect(rects.every(rect => rect.w === 1 && rect.fill === DARK_FALLBACK.wavePeak)).toBe(true)
    const loud = rects.filter(rect => rect.x < 45)
    expect(loud.every(rect => rect.h > 20)).toBe(true)
    expect(rects.filter(rect => rect.x >= 55).every(rect => rect.h <= 2)).toBe(true)
  })

  it('paints the RMS core in its own colour, never the peak colour', () => {
    // Regression: the RMS body once inherited the host's label token, which on
    // the live light skin equals the brand colour — the lane collapsed into a
    // single opaque block and the dynamics vanished.
    const { g, rects } = fakeContext()
    drawWaveform(g, { ...paint({ start: 0, end: 5 }, 10, peaks), showRms: true })
    const fills = new Set(rects.map(rect => rect.fill))
    expect(fills.size).toBe(2)
    expect(fills.has(DARK_FALLBACK.wavePeak)).toBe(true)
    expect(fills.has(DARK_FALLBACK.waveRms)).toBe(true)
    expect(DARK_FALLBACK.wavePeak).not.toBe(DARK_FALLBACK.waveRms)
  })

  it('draws the RMS core inside the peak band', () => {
    const { g, rects } = fakeContext()
    drawWaveform(g, { ...paint({ start: 0, end: 5 }, 10, peaks), showRms: true })
    const band = perColumn(rects, 100, DARK_FALLBACK.wavePeak)
    const core = perColumn(rects, 100, DARK_FALLBACK.waveRms)
    expect(core.every((value, index) => value <= (band[index] ?? 0))).toBe(true)
    expect(core.every(value => value > 15)).toBe(true)
  })

  it('leaves the silent window without any RMS core', () => {
    const { g, rects } = fakeContext()
    drawWaveform(g, { ...paint({ start: 5, end: 10 }, 10, peaks), showRms: true })
    const cores = rects.filter(rect => rect.fill === DARK_FALLBACK.waveRms && rect.h > 1.5)
    expect(cores).toHaveLength(0)
  })
})
