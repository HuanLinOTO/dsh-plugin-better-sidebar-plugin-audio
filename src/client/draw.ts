/**
 * Canvas painting for the four surfaces: the waveform (with its time ruler),
 * the live spectrum, the waterfall bitmap and the whole-file spectrogram.
 *
 * Painters never fill their own background: the container supplies it through
 * CSS (which resolves the host tokens properly), so the canvas stays
 * transparent and every colour that reaches `fillStyle` is a concrete colour
 * from {@link CanvasPalette} — never a `var()` a canvas would silently drop.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/draw
 */

import type { CanvasPalette } from './theme.ts'
import type { ChannelPeaks } from './peaks.ts'
import type { Selection } from './selection.ts'
import { frequencyTicks, frequencyToX, type SpectrumLayout } from './spectrum.ts'
import { hzToMel, melToHz, type FrequencyScale } from './spectrogram.ts'
import { formatHz, formatTime, tickStep, ticks, xAtTime, type WaveView } from './view.ts'

/** Monospace stack for axis labels (canvas cannot use the host font tokens). */
const LABEL_FONT = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

/** Paint request for the waveform lane. */
export interface WaveformPaint {
  /** Canvas width in CSS pixels. */
  width: number
  /** Canvas height in CSS pixels. */
  height: number
  /** Visible window. */
  view: WaveView
  /**
   * Time span the peaks array covers — the whole file for the decoded
   * envelope, or exactly the visible window for an envelope re-derived from
   * PCM. The envelope columns are mapped through this, never through the
   * canvas width, so zooming crops the envelope instead of squeezing the
   * whole file into the lane whatever the window is.
   */
  duration: number
  /** Time the peaks array starts at (0 for the whole file, the window start for a re-derived envelope). */
  peaksStart: number
  /** Envelope to draw (already the selected channel's). */
  peaks: ChannelPeaks
  /** Overlay the RMS body. */
  showRms: boolean
  /** Playback position in seconds, or null when unknown. */
  playhead: number | null
  /** Selection band, or null. */
  selection: Selection | null
  /** Palette. */
  colors: CanvasPalette
}

/**
 * Clamp a painted y coordinate to a pixel inside the canvas.
 * @param y - the coordinate.
 * @param height - canvas height in CSS pixels.
 * @returns a whole pixel row that can actually be drawn.
 */
function clampPixel(y: number, height: number): number {
  return Math.min(Math.max(Math.round(y), 0), Math.max(0, height - 1))
}

/**
 * Paint the waveform: time grid, envelope, RMS overlay, selection, playhead.
 * @param g - a 2D context already scaled for the device pixel ratio.
 * @param paint - geometry, data and palette.
 */
export function drawWaveform(g: CanvasRenderingContext2D, paint: WaveformPaint): void {
  const { width, height, view, peaks, colors } = paint
  g.clearRect(0, 0, width, height)
  const middle = height / 2
  const columns = peaks.min.length

  g.strokeStyle = colors.grid
  g.lineWidth = 1
  for (const time of ticks(view, width)) {
    const x = Math.round(xAtTime(view, time, width)) + 0.5
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, height)
    g.stroke()
  }

  if (paint.selection !== null) {
    const from = xAtTime(view, paint.selection.start, width)
    const to = xAtTime(view, paint.selection.end, width)
    g.fillStyle = colors.selection
    g.fillRect(Math.min(from, to), 0, Math.abs(to - from), height)
    g.strokeStyle = colors.selectionEdge
    g.beginPath()
    g.moveTo(Math.round(from) + 0.5, 0)
    g.lineTo(Math.round(from) + 0.5, height)
    g.moveTo(Math.round(to) + 0.5, 0)
    g.lineTo(Math.round(to) + 0.5, height)
    g.stroke()
  }

  g.strokeStyle = colors.axis
  g.beginPath()
  g.moveTo(0, Math.round(middle) + 0.5)
  g.lineTo(width, Math.round(middle) + 0.5)
  g.stroke()

  if (columns > 0 && width > 0) {
    const gain = middle * 0.94
    // Map each canvas column to the envelope column range covering the same
    // time slice of the visible window. Without this the envelope is mapped
    // by canvas position alone and zooming changes nothing but the grid.
    const total = paint.duration
    const span = view.end - view.start
    const rangeOf = (x: number): { from: number; to: number } => {
      let from: number
      let to: number
      if (total > 0) {
        const origin = paint.peaksStart
        const t0 = view.start + (x / width) * span - origin
        const t1 = view.start + ((x + 1) / width) * span - origin
        from = Math.floor(Math.min(Math.max((t0 / total) * columns, 0), columns))
        to = Math.ceil(Math.min(Math.max((t1 / total) * columns, 0), columns))
      } else {
        from = Math.floor((x / width) * columns)
        to = Math.ceil(((x + 1) / width) * columns)
      }
      return { from, to: Math.min(Math.max(to, from + 1), columns) }
    }
    // Two layers, light under dark: the peak band spans the column's whole
    // [min, max] range, the RMS body is the solid core inside it.
    //
    // The band must be FILLED, and this is subtler than it looks. Filling it
    // with the opaque waveform colour (the obvious first implementation) turns
    // an end-to-end view of a normalised song into one solid block — every
    // column spans nearly the full height, so the RMS core is buried and no
    // dynamics survive. Drawing it as bare per-column outline pixels instead
    // overcorrects: nothing joins a transient to the body it belongs to, so on
    // a view where each column covers a third of a second the lane fills with
    // scattered dots floating in empty space. Light fill, dark core keeps both
    // the continuity and the contrast.
    g.fillStyle = colors.wavePeak
    for (let x = 0; x < width; x++) {
      const { from, to } = rangeOf(x)
      let low = 0
      let high = 0
      for (let column = from; column < to; column++) {
        low = Math.min(low, peaks.min[column] ?? 0)
        high = Math.max(high, peaks.max[column] ?? 0)
      }
      const top = clampPixel(middle - high * gain, height)
      const bottom = clampPixel(middle - low * gain, height)
      g.fillRect(x, top, 1, Math.max(1, bottom - top))
    }
    if (paint.showRms) {
      g.fillStyle = colors.waveRms
      for (let x = 0; x < width; x++) {
        const { from, to } = rangeOf(x)
        let sum = 0
        let seen = 0
        for (let column = from; column < to; column++) {
          const value = peaks.rms[column] ?? 0
          sum += value * value
          seen += 1
        }
        const value = (seen === 0 ? 0 : Math.sqrt(sum / seen)) * gain
        g.fillRect(x, middle - value, 1, Math.max(1, value * 2))
      }
    }
  }

  if (paint.playhead !== null) {
    const x = Math.round(xAtTime(view, paint.playhead, width)) + 0.5
    g.fillStyle = colors.playhead
    g.fillRect(x, 0, 1.5, height)
  }
}

/** Paint request for the time ruler. */
export interface RulerPaint {
  /** Canvas width in CSS pixels. */
  width: number
  /** Canvas height in CSS pixels. */
  height: number
  /** Visible window. */
  view: WaveView
  /** Palette. */
  colors: CanvasPalette
}

/**
 * Paint the time ruler under the main lane.
 * @param g - a 2D context already scaled for the device pixel ratio.
 * @param paint - geometry, window and palette.
 */
export function drawTimeRuler(g: CanvasRenderingContext2D, paint: RulerPaint): void {
  const { width, height, view, colors } = paint
  g.clearRect(0, 0, width, height)
  g.font = LABEL_FONT
  g.textBaseline = 'middle'
  const step = tickStep(view.end - view.start, width)
  const withMillis = step < 1
  for (const time of ticks(view, width)) {
    const x = Math.round(xAtTime(view, time, width)) + 0.5
    g.strokeStyle = colors.grid
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, 4)
    g.stroke()
    g.fillStyle = colors.text
    g.fillText(formatTime(time, withMillis), Math.min(x + 4, Math.max(0, width - 52)), height / 2 + 1)
  }
  g.strokeStyle = colors.axis
  g.lineWidth = 1
  g.beginPath()
  g.moveTo(0, 0.5)
  g.lineTo(width, 0.5)
  g.stroke()
}

/** Paint request for the live spectrum lane. */
export interface SpectrumPaint {
  /** Canvas width in CSS pixels. */
  width: number
  /** Canvas height in CSS pixels. */
  height: number
  /** One magnitude per pixel column, 0..1. */
  values: Float32Array
  /** Bars or line. */
  style: 'bars' | 'line'
  /** Axis layout (must agree with `values.length`). */
  layout: SpectrumLayout
  /** Frequency of the loudest bin, or null. */
  peakHz: number | null
  /** Frequency under the pointer, or null. */
  cursorHz: number | null
  /** Palette. */
  colors: CanvasPalette
}

/** Height of the frequency ruler strip inside a spectrum canvas. */
const SPECTRUM_RULER = 13

/**
 * Paint the live spectrum.
 * @param g - a 2D context already scaled for the device pixel ratio.
 * @param paint - geometry, magnitudes and palette.
 */
export function drawSpectrum(g: CanvasRenderingContext2D, paint: SpectrumPaint): void {
  const { width, height, values, colors, layout } = paint
  const plot = Math.max(1, height - SPECTRUM_RULER)
  g.clearRect(0, 0, width, height)
  g.font = LABEL_FONT
  g.textBaseline = 'top'
  g.strokeStyle = colors.spectrumGrid
  g.lineWidth = 1
  for (const tick of frequencyTicks(layout, width)) {
    const x = Math.round(tick.x) + 0.5
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, plot)
    g.stroke()
    g.fillStyle = colors.text
    g.fillText(tick.label, Math.min(x + 3, Math.max(0, width - 26)), plot + 1)
  }

  if (paint.style === 'bars') {
    g.fillStyle = colors.spectrum
    for (let x = 0; x < width; x++) {
      const barHeight = (values[x] ?? 0) * plot
      if (barHeight <= 0) continue
      g.fillRect(x, plot - barHeight, 1, barHeight)
    }
  } else {
    g.beginPath()
    g.moveTo(0, plot)
    for (let x = 0; x < width; x++) g.lineTo(x, plot - (values[x] ?? 0) * plot)
    g.lineTo(Math.max(0, width - 1), plot)
    g.closePath()
    g.fillStyle = colors.spectrumFill
    g.fill()
    g.beginPath()
    for (let x = 0; x < width; x++) {
      const y = plot - (values[x] ?? 0) * plot
      if (x === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.strokeStyle = colors.spectrum
    g.lineWidth = 1.5
    g.stroke()
  }

  if (paint.cursorHz !== null && paint.cursorHz > 0) {
    const x = Math.round(frequencyToX(paint.cursorHz, layout, width)) + 0.5
    g.strokeStyle = colors.axis
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, plot)
    g.stroke()
  }
  if (paint.peakHz !== null && paint.peakHz > 0) {
    const x = Math.round(frequencyToX(paint.peakHz, layout, width)) + 0.5
    g.strokeStyle = colors.accent
    g.setLineDash([3, 3])
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, plot)
    g.stroke()
    g.setLineDash([])
    g.fillStyle = colors.accent
    g.fillText(formatHz(paint.peakHz), Math.min(x + 3, Math.max(0, width - 56)), 1)
  }
}

/**
 * Blit a waterfall frame.
 * @param g - a 2D context already scaled for the device pixel ratio.
 * @param frame - the RGBA frame, sized to the canvas.
 */
export function drawWaterfallFrame(g: CanvasRenderingContext2D, frame: ImageData): void {
  g.putImageData(frame, 0, 0)
}

/** The slice of a spectrogram the painter needs. */
export interface SpectrogramFacts {
  /** Time resolution. */
  columns: number
  /** Frequency resolution. */
  bands: number
  /** Left edge of the analyzed window, in seconds. */
  startTime: number
  /** Right edge of the analyzed window, in seconds. */
  endTime: number
  /** Lowest frequency shown. */
  minHz: number
  /** Highest frequency shown. */
  maxHz: number
  /** Frequency spacing of the axis. */
  scale: FrequencyScale
}

/** Paint request for the whole-file spectrogram lane. */
export interface SpectrogramPaint {
  /** Canvas width in CSS pixels. */
  width: number
  /** Canvas height in CSS pixels. */
  height: number
  /** The pre-rendered heat map (one pixel per cell), or null while unavailable. */
  image: CanvasImageSource | null
  /** Grid facts. */
  spec: SpectrogramFacts
  /** Visible window (same timeline as the waveform). */
  view: WaveView
  /** Playback position in seconds, or null. */
  playhead: number | null
  /** Selection band, or null. */
  selection: Selection | null
  /** Palette. */
  colors: CanvasPalette
}

/**
 * Paint the whole-file spectrogram over the visible window.
 * @param g - a 2D context already scaled for the device pixel ratio.
 * @param paint - geometry, the heat map and the palette.
 */
export function drawSpectrogramFrame(g: CanvasRenderingContext2D, paint: SpectrogramPaint): void {
  const { width, height, view, colors, spec } = paint
  g.clearRect(0, 0, width, height)
  const plot = height

  // The grid was computed for exactly this window, so it maps 1:1 onto the
  // canvas. Smoothing is off on purpose: interpolating a heat map smears the
  // harmonics into mush, while nearest-neighbour keeps every cell crisp.
  if (paint.image !== null && spec.columns > 0 && spec.bands > 0) {
    g.imageSmoothingEnabled = false
    try {
      g.drawImage(paint.image, 0, 0, spec.columns, spec.bands, 0, 0, width, plot)
    } catch {
      // A detached or zero-sized source (jsdom) is simply skipped.
    }
  }

  // Time grid, drawn over the heat map in a colour that reads on both ramps.
  g.strokeStyle = colors.grid
  g.lineWidth = 1
  for (const time of ticks(view, width)) {
    const x = Math.round(xAtTime(view, time, width)) + 0.5
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, plot)
    g.stroke()
  }

  if (paint.selection !== null) {
    const from = xAtTime(view, paint.selection.start, width)
    const to = xAtTime(view, paint.selection.end, width)
    g.strokeStyle = colors.selectionEdge
    g.lineWidth = 1.5
    g.strokeRect(Math.min(from, to) + 0.5, 0.5, Math.abs(to - from), plot - 1)
  }

  // Frequency labels down the right edge (top = Nyquist side of the map).
  g.font = LABEL_FONT
  g.textBaseline = 'top'
  const middle = spec.scale === 'mel'
    ? melToHz((hzToMel(spec.minHz) + hzToMel(spec.maxHz)) / 2)
    : (spec.scale === 'log'
      ? Math.sqrt(Math.max(spec.minHz, 1) * spec.maxHz)
      : (spec.minHz + spec.maxHz) / 2)
  const labels: Array<{ hz: number; y: number }> = [
    { hz: spec.maxHz, y: 1 },
    { hz: middle, y: plot / 2 - 5 },
    { hz: spec.minHz, y: plot - 12 },
  ]
  for (const label of labels) {
    const text = formatHz(label.hz)
    const textWidth = g.measureText(text).width
    g.fillStyle = colors.text
    g.fillText(text, Math.max(2, width - textWidth - 4), label.y)
  }

  if (paint.playhead !== null) {
    const x = Math.round(xAtTime(view, paint.playhead, width)) + 0.5
    g.fillStyle = colors.playhead
    g.fillRect(x, 0, 1.5, plot)
  }
}

/** Re-export for the painter tests. */
export { tickStep }
