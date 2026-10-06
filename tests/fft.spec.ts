import { describe, expect, it } from 'vitest'
import { analyzeFrame, fftInPlace, hannWindow, isPowerOfTwo, magnitudes } from '../src/client/fft.ts'

/** Fill a frame with a sine wave. */
function sine(size: number, cycles: number): Float32Array {
  const out = new Float32Array(size)
  for (let index = 0; index < size; index++) out[index] = Math.sin((2 * Math.PI * cycles * index) / size)
  return out
}

describe('isPowerOfTwo', () => {
  it('accepts powers of two and rejects the rest', () => {
    expect(isPowerOfTwo(1)).toBe(true)
    expect(isPowerOfTwo(1024)).toBe(true)
    expect(isPowerOfTwo(0)).toBe(false)
    expect(isPowerOfTwo(3)).toBe(false)
    expect(isPowerOfTwo(1000)).toBe(false)
  })
})

describe('fftInPlace', () => {
  it('puts all the energy of a DC signal in bin 0', () => {
    const re = new Float32Array(8).fill(1)
    const im = new Float32Array(8)
    fftInPlace(re, im)
    expect(re[0]).toBeCloseTo(8, 4)
    for (let bin = 1; bin < 8; bin++) expect(Math.hypot(re[bin] ?? 0, im[bin] ?? 0)).toBeLessThan(1e-4)
  })

  it('peaks at the bin matching a whole number of cycles', () => {
    const size = 64
    const re = sine(size, 4)
    const im = new Float32Array(size)
    fftInPlace(re, im)
    const spectrum = magnitudes(re, im)
    let peakBin = 0
    for (let bin = 1; bin < spectrum.length; bin++) {
      if ((spectrum[bin] ?? 0) > (spectrum[peakBin] ?? 0)) peakBin = bin
    }
    expect(peakBin).toBe(4)
    expect(spectrum[4]).toBeCloseTo(size / 2, 2)
  })

  it('rejects a non power-of-two length and mismatched halves', () => {
    expect(() => fftInPlace(new Float32Array(3), new Float32Array(3))).toThrowError(/power of two/)
    expect(() => fftInPlace(new Float32Array(4), new Float32Array(8))).toThrowError(/equal length/)
  })

  it('handles an empty frame', () => {
    expect(() => fftInPlace(new Float32Array(0), new Float32Array(0))).not.toThrow()
  })
})

describe('hannWindow', () => {
  it('tapers from 0 to 1 and back', () => {
    const window = hannWindow(5)
    expect(window.length).toBe(5)
    expect(window[0]).toBeCloseTo(0, 6)
    expect(window[4]).toBeCloseTo(0, 6)
    expect(window[2]).toBeCloseTo(1, 6)
    expect(window[1]).toBeGreaterThan(0)
    expect(window[1]).toBeLessThan(1)
  })

  it('keeps a single-sample window usable', () => {
    expect(hannWindow(1)[0]).toBeCloseTo(0, 6)
    expect(hannWindow(0).length).toBe(0)
  })
})

describe('analyzeFrame', () => {
  it('returns one magnitude per bin below Nyquist', () => {
    const scratch = {
      re: new Float32Array(32),
      im: new Float32Array(32),
      magnitudes: new Float32Array(16),
    }
    const spectrum = analyzeFrame(sine(32, 3), hannWindow(32), scratch)
    expect(spectrum.length).toBe(16)
    let peakBin = 0
    for (let bin = 1; bin < spectrum.length; bin++) {
      if ((spectrum[bin] ?? 0) > (spectrum[peakBin] ?? 0)) peakBin = bin
    }
    expect(peakBin).toBe(3)
  })

  it('zero-pads a short frame instead of throwing', () => {
    const scratch = {
      re: new Float32Array(16),
      im: new Float32Array(16),
      magnitudes: new Float32Array(8),
    }
    expect(() => analyzeFrame(new Float32Array(4), undefined, scratch)).not.toThrow()
  })
})
