/**
 * Spectrum maths: how FFT bins map onto the drawn columns (log-frequency by
 * default), the peak-bin read-out, and the frequency ruler labels. Pure.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/spectrum
 */

/** How the frequency axis is laid out. */
export interface SpectrumLayout {
  /** FFT size the analyser is configured with (bins = fftSize / 2). */
  fftSize: number
  /** Sample rate of the analyser's context. */
  sampleRate: number
  /** Drawn columns (canvas CSS width). */
  columns: number
  /** Left edge of the axis, in hertz. */
  minHz: number
  /** Right edge of the axis, in hertz. */
  maxHz: number
  /** Logarithmic (musical) spacing when true, linear when false. */
  log: boolean
}

/** Analyser FFT size used by the viewer (2048 bins` => `1024 magnitude bins). */
export const FFT_SIZE = 2048

/** Lowest frequency shown on the axis. */
export const MIN_HZ = 30

/**
 * Build a layout for one canvas size.
 * @param columns - canvas CSS width in pixels.
 * @param sampleRate - the AudioContext sample rate.
 * @param options - axis bounds and spacing.
 * @returns the layout.
 */
export function spectrumLayout(
  columns: number,
  sampleRate: number,
  options: { fftSize?: number; minHz?: number; maxHz?: number; log?: boolean } = {},
): SpectrumLayout {
  const fftSize = options.fftSize ?? FFT_SIZE
  const nyquist = Math.max(sampleRate, 1) / 2
  const minHz = Math.max(0, Math.min(options.minHz ?? MIN_HZ, nyquist))
  const maxHz = Math.max(minHz + 1, Math.min(options.maxHz ?? nyquist, nyquist))
  return {
    fftSize,
    sampleRate,
    columns: Math.max(1, Math.floor(columns)),
    minHz,
    maxHz,
    log: options.log ?? true,
  }
}

/**
 * The bin window one column covers.
 * @param column - column index, in `[0, columns)`.
 * @param layout - the axis layout.
 * @returns inclusive-exclusive bin range `[from, to)`.
 */
export function binRangeOfColumn(column: number, layout: SpectrumLayout): { from: number; to: number } {
  const bins = layout.fftSize / 2
  const nyquist = layout.sampleRate / 2
  const ratioFrom = column / layout.columns
  const ratioTo = (column + 1) / layout.columns
  const hzFrom = layout.log
    ? layout.minHz * Math.pow(layout.maxHz / layout.minHz, ratioFrom)
    : layout.minHz + (layout.maxHz - layout.minHz) * ratioFrom
  const hzTo = layout.log
    ? layout.minHz * Math.pow(layout.maxHz / layout.minHz, ratioTo)
    : layout.minHz + (layout.maxHz - layout.minHz) * ratioTo
  const from = Math.floor((hzFrom / nyquist) * bins)
  const to = Math.max(from + 1, Math.ceil((hzTo / nyquist) * bins))
  return { from: Math.max(0, Math.min(from, bins - 1)), to: Math.max(1, Math.min(to, bins)) }
}

/**
 * Collapse analyser bins into one value per drawn column.
 * @param bins - `Uint8Array` straight from `getByteFrequencyData`.
 * @param layout - the axis layout.
 * @returns column magnitudes in 0..1.
 */
export function collapseSpectrum(bins: Uint8Array, layout: SpectrumLayout): Float32Array {
  const out = new Float32Array(layout.columns)
  for (let column = 0; column < layout.columns; column++) {
    const { from, to } = binRangeOfColumn(column, layout)
    let peak = 0
    for (let bin = from; bin < to && bin < bins.length; bin++) peak = Math.max(peak, bins[bin] ?? 0)
    out[column] = peak / 255
  }
  return out
}

/**
 * The strongest bin in a frame.
 * @param bins - `Uint8Array` straight from `getByteFrequencyData`.
 * @param sampleRate - the AudioContext sample rate.
 * @param fftSize - the analyser's FFT size.
 * @returns the frequency of the loudest bin, in hertz (0 when silent).
 */
export function peakFrequency(bins: Uint8Array, sampleRate: number, fftSize: number): number {
  let index = 0
  let value = 0
  for (let bin = 1; bin < bins.length; bin++) {
    const current = bins[bin] ?? 0
    if (current > value) {
      value = current
      index = bin
    }
  }
  if (value === 0) return 0
  return (index * sampleRate) / fftSize
}

/**
 * Frequency ruler labels across the axis.
 * @param layout - the axis layout.
 * @param width - canvas width in CSS pixels.
 * @returns ticks with their pixel offset and label.
 */
export function frequencyTicks(layout: SpectrumLayout, width: number): Array<{ hz: number; x: number; label: string }> {
  const candidates = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
  const out: Array<{ hz: number; x: number; label: string }> = []
  for (const hz of candidates) {
    if (hz < layout.minHz || hz > layout.maxHz) continue
    const ratio = layout.log
      ? Math.log(hz / layout.minHz) / Math.log(layout.maxHz / layout.minHz)
      : (hz - layout.minHz) / (layout.maxHz - layout.minHz)
    out.push({ hz, x: ratio * width, label: hz >= 1000 ? `${hz / 1000}k` : `${hz}` })
  }
  return out
}

/**
 * Pixel offset of one frequency on the spectrum axis.
 * @param hz - frequency in hertz.
 * @param layout - the axis layout.
 * @param width - canvas width in CSS pixels.
 * @returns the pixel offset (clamped to the canvas).
 */
export function frequencyToX(hz: number, layout: SpectrumLayout, width: number): number {
  if (hz <= 0 || layout.maxHz <= layout.minHz) return 0
  const ratio = layout.log
    ? Math.log(hz / layout.minHz) / Math.log(layout.maxHz / layout.minHz)
    : (hz - layout.minHz) / (layout.maxHz - layout.minHz)
  return Math.min(Math.max(ratio, 0), 1) * width
}

/**
 * Frequency under a pixel on the spectrum axis.
 * @param x - pixel offset.
 * @param layout - the axis layout.
 * @param width - canvas width in CSS pixels.
 * @returns the frequency at that pixel.
 */
export function frequencyAtX(x: number, layout: SpectrumLayout, width: number): number {
  const ratio = width <= 0 ? 0 : Math.min(Math.max(x / width, 0), 1)
  return layout.log
    ? layout.minHz * Math.pow(layout.maxHz / layout.minHz, ratio)
    : layout.minHz + (layout.maxHz - layout.minHz) * ratio
}
