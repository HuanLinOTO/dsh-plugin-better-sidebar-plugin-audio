/**
 * A small radix-2 FFT, written here rather than pulled in as a dependency: the
 * spectrogram needs exactly one transform (power-of-two, real input, power
 * spectrum), and the plugin must stay dependency-free.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/fft
 */

/**
 * Whether a length is a power of two.
 * @param value - candidate length.
 * @returns true for 1, 2, 4, 8, …
 */
export function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0
}

/**
 * Iterative in-place radix-2 FFT (Cooley–Tukey, decimation in time).
 * @param re - real parts, length must be a power of two.
 * @param im - imaginary parts, same length as `re`.
 * @throws {Error} when the lengths differ or are not a power of two.
 */
export function fftInPlace(re: Float32Array, im: Float32Array): void {
  const size = re.length
  if (size !== im.length) throw new Error('fftInPlace: real and imaginary parts must have equal length')
  if (size === 0) return
  if (!isPowerOfTwo(size)) throw new Error('fftInPlace: length must be a power of two')
  // Bit-reversal permutation.
  for (let index = 1, reversed = 0; index < size; index++) {
    let bit = size >> 1
    for (; (reversed & bit) !== 0; bit >>= 1) reversed ^= bit
    reversed ^= bit
    if (index < reversed) {
      const swapRe = re[index] ?? 0
      re[index] = re[reversed] ?? 0
      re[reversed] = swapRe
      const swapIm = im[index] ?? 0
      im[index] = im[reversed] ?? 0
      im[reversed] = swapIm
    }
  }
  // Butterflies.
  for (let span = 2; span <= size; span <<= 1) {
    const angle = (-2 * Math.PI) / span
    const stepRe = Math.cos(angle)
    const stepIm = Math.sin(angle)
    const half = span >> 1
    for (let base = 0; base < size; base += span) {
      let curRe = 1
      let curIm = 0
      for (let offset = 0; offset < half; offset++) {
        const evenIndex = base + offset
        const oddIndex = evenIndex + half
        const oddRe = re[oddIndex] ?? 0
        const oddIm = im[oddIndex] ?? 0
        const vRe = oddRe * curRe - oddIm * curIm
        const vIm = oddRe * curIm + oddIm * curRe
        const uRe = re[evenIndex] ?? 0
        const uIm = im[evenIndex] ?? 0
        re[evenIndex] = uRe + vRe
        im[evenIndex] = uIm + vIm
        re[oddIndex] = uRe - vRe
        im[oddIndex] = uIm - vIm
        const nextRe = curRe * stepRe - curIm * stepIm
        curIm = curRe * stepIm + curIm * stepRe
        curRe = nextRe
      }
    }
  }
}

/**
 * A periodic Hann window.
 * @param size - window length in samples.
 * @returns the window (zero-length input yields a zero-length window).
 */
export function hannWindow(size: number): Float32Array {
  const window = new Float32Array(Math.max(0, Math.floor(size)))
  const last = Math.max(1, window.length - 1)
  for (let index = 0; index < window.length; index++) {
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / last)
  }
  return window
}

/**
 * Power spectrum of a transformed frame (the first half of the bins).
 * @param re - transformed real parts.
 * @param im - transformed imaginary parts.
 * @param out - optional destination (reused across frames).
 * @returns magnitudes, one per bin below Nyquist.
 */
export function magnitudes(re: Float32Array, im: Float32Array, out?: Float32Array): Float32Array {
  const half = Math.max(0, Math.floor(re.length / 2))
  const result = out ?? new Float32Array(half)
  for (let bin = 0; bin < half; bin++) {
    const real = re[bin] ?? 0
    const imaginary = im[bin] ?? 0
    result[bin] = Math.sqrt(real * real + imaginary * imaginary)
  }
  return result
}

/**
 * Analyze one frame of samples into its power spectrum.
 * @param samples - source samples (short frames are zero-padded).
 * @param window - windowing function; pass undefined for a rectangular window.
 * @param scratch - reusable buffers (same layout as the transform length).
 * @returns the magnitudes, one per bin below Nyquist.
 */
export function analyzeFrame(
  samples: Float32Array,
  window: Float32Array | undefined,
  scratch: { re: Float32Array; im: Float32Array; magnitudes: Float32Array },
): Float32Array {
  const size = scratch.re.length
  for (let index = 0; index < size; index++) {
    const value = samples[index] ?? 0
    scratch.re[index] = window === undefined ? value : value * (window[index] ?? 1)
    scratch.im[index] = 0
  }
  fftInPlace(scratch.re, scratch.im)
  return magnitudes(scratch.re, scratch.im, scratch.magnitudes)
}
