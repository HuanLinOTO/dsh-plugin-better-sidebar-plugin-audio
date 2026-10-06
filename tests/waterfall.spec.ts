import { describe, expect, it } from 'vitest'
import { WaterfallBuffer, magnitudeColor } from '../src/client/waterfall.ts'

describe('magnitudeColor', () => {
  it('clamps out-of-range magnitudes', () => {
    expect(magnitudeColor(-5)).toEqual(magnitudeColor(0))
    expect(magnitudeColor(4)).toEqual(magnitudeColor(1))
    expect(magnitudeColor(Number.NaN)).toEqual(magnitudeColor(0))
  })

  it('inverts the ramp for a light skin', () => {
    const sum = (rgb: readonly [number, number, number]): number => rgb[0] + rgb[1] + rgb[2]
    // Strong energy darkens on a light skin, the opposite of the dark one.
    expect(sum(magnitudeColor(1, 'light'))).toBeLessThan(sum(magnitudeColor(0, 'light')))
    expect(sum(magnitudeColor(1))).toBeGreaterThan(sum(magnitudeColor(0)))
  })

  it('ramps from dark to bright', () => {
    const dark = magnitudeColor(0)
    const bright = magnitudeColor(1)
    const sum = (rgb: readonly [number, number, number]): number => rgb[0] + rgb[1] + rgb[2]
    expect(sum(bright)).toBeGreaterThan(sum(dark))
  })
})

describe('WaterfallBuffer', () => {
  it('keeps the newest row at the bottom', () => {
    const buffer = new WaterfallBuffer(3, 4)
    buffer.push([1, 0, 0])
    buffer.push([0, 1, 0])
    expect(buffer.at(0, 3)).toBeCloseTo(0, 6)
    expect(buffer.at(1, 3)).toBeCloseTo(1, 6)
    expect(buffer.at(0, 2)).toBeCloseTo(1, 6)
    expect(buffer.rows).toBe(2)
  })

  it('drops the oldest row once the depth is reached', () => {
    const buffer = new WaterfallBuffer(2, 2)
    buffer.push([1, 1])
    buffer.push([0, 0])
    buffer.push([0.5, 0.5])
    expect(buffer.rows).toBe(2)
    expect(buffer.at(0, 0)).toBeCloseTo(0, 6)
    // Stored as one byte, so the read-back is quantized to 1/255.
    expect(buffer.at(0, 1)).toBeCloseTo(0.5, 2)
  })

  it('zero-pads a short row', () => {
    const buffer = new WaterfallBuffer(3, 1)
    buffer.push([1])
    expect(buffer.at(0, 0)).toBeCloseTo(1, 6)
    expect(buffer.at(1, 0)).toBe(0)
  })

  it('reads outside the grid as silence', () => {
    const buffer = new WaterfallBuffer(2, 2)
    expect(buffer.at(-1, 0)).toBe(0)
    expect(buffer.at(0, -1)).toBe(0)
    expect(buffer.at(9, 9)).toBe(0)
  })

  it('clears its history', () => {
    const buffer = new WaterfallBuffer(2, 2)
    buffer.push([1, 1])
    buffer.clear()
    expect(buffer.rows).toBe(0)
    expect(buffer.at(0, 1)).toBe(0)
  })

  it('renders opaque RGBA of the right size', () => {
    const buffer = new WaterfallBuffer(2, 2)
    buffer.push([1, 1])
    const out = new Uint8ClampedArray(2 * 2 * 4)
    buffer.render(out)
    expect(out.length).toBe(16)
    for (let index = 0; index < 4; index++) expect(out[index * 4 + 3]).toBe(255)
  })
})
