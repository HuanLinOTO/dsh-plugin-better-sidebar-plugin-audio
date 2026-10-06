/**
 * Spectrogram (waterfall) buffer: a pure ring of rows plus the magnitude ->
 * colour transfer, kept apart from any canvas so both are testable. The colour
 * ramp follows the active skin — a light skin inverts it so weak energy stays
 * near the background colour instead of glowing white on white.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/waterfall
 */

import type { ThemeVariant } from './theme.ts'

/** Dark-skin ramp: near-black to hot yellow. */
const RAMP_DARK: ReadonlyArray<readonly [number, number, number]> = [
  [8, 12, 28],
  [20, 46, 96],
  [24, 96, 128],
  [46, 158, 110],
  [166, 196, 72],
  [248, 216, 96],
  [255, 252, 214],
]

/** Light-skin ramp: white to deep indigo (the same ramp, inverted). */
const RAMP_LIGHT: ReadonlyArray<readonly [number, number, number]> = [
  [252, 253, 255],
  [214, 230, 246],
  [162, 202, 232],
  [104, 162, 212],
  [58, 116, 186],
  [38, 76, 158],
  [24, 34, 96],
]

/**
 * Map one magnitude onto an RGB triple.
 * @param magnitude - column magnitude in 0..1.
 * @param variant - active skin; the ramp inverts for a light one.
 * @returns a triple, each component 0..255.
 */
export function magnitudeColor(magnitude: number, variant: ThemeVariant = 'dark'): readonly [number, number, number] {
  const ramp = variant === 'light' ? RAMP_LIGHT : RAMP_DARK
  const value = Number.isFinite(magnitude) ? Math.min(Math.max(magnitude, 0), 1) : 0
  const scaled = value * (ramp.length - 1)
  const index = Math.min(Math.floor(scaled), ramp.length - 2)
  const fraction = scaled - index
  const from = ramp[index] ?? ramp[0]!
  const to = ramp[index + 1] ?? ramp[ramp.length - 1]!
  return [
    Math.round(from[0] + (to[0] - from[0]) * fraction),
    Math.round(from[1] + (to[1] - from[1]) * fraction),
    Math.round(from[2] + (to[2] - from[2]) * fraction),
  ]
}

/**
 * A fixed-size grid of spectrum rows: newest row last, oldest dropped.
 * Row-major byte array of width * height cells, one byte per cell.
 */
export class WaterfallBuffer {
  /** Grid width in pixels (spectrum columns). */
  readonly width: number
  /** Grid height in pixels (history depth). */
  readonly height: number
  private readonly pixels: Uint8Array
  private filled = 0

  constructor(width: number, height: number) {
    this.width = Math.max(1, Math.floor(width))
    this.height = Math.max(1, Math.floor(height))
    this.pixels = new Uint8Array(this.width * this.height)
  }

  /** How many rows have been written (capped at the grid height). */
  get rows(): number {
    return this.filled
  }

  /**
   * Push one spectrum row, scrolling the older rows up.
   * @param values - one magnitude per column (0..1); short input is zero-padded.
   */
  push(values: Float32Array | readonly number[]): void {
    const { width, height } = this
    this.pixels.copyWithin(0, width)
    const base = (height - 1) * width
    for (let column = 0; column < width; column++) {
      const value = values[column] ?? 0
      this.pixels[base + column] = Math.round(Math.min(Math.max(value, 0), 1) * 255)
    }
    this.filled = Math.min(height, this.filled + 1)
  }

  /** Drop all history. */
  clear(): void {
    this.pixels.fill(0)
    this.filled = 0
  }

  /**
   * Read one magnitude back.
   * @param column - column index.
   * @param row - row index (0 = oldest).
   * @returns the stored magnitude in 0..1, or 0 outside the grid.
   */
  at(column: number, row: number): number {
    if (column < 0 || row < 0 || column >= this.width || row >= this.height) return 0
    return (this.pixels[row * this.width + column] ?? 0) / 255
  }

  /**
   * Render the grid into an RGBA buffer.
   * @param out - destination of width * height * 4 bytes (may be reused).
   * @param variant - active skin (the ramp inverts for a light one).
   * @returns the same buffer, filled.
   */
  render(out: Uint8ClampedArray, variant: ThemeVariant = 'dark'): Uint8ClampedArray {
    const size = this.width * this.height
    for (let index = 0; index < size; index++) {
      const [r, g, b] = magnitudeColor((this.pixels[index] ?? 0) / 255, variant)
      out[index * 4] = r
      out[index * 4 + 1] = g
      out[index * 4 + 2] = b
      out[index * 4 + 3] = 255
    }
    return out
  }
}
