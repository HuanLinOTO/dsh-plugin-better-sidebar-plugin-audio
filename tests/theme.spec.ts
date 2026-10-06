// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DARK_FALLBACK,
  LIGHT_FALLBACK,
  PROBE_SENTINEL,
  colorLuminance,
  readPalette,
  resolveToken,
  withAlpha,
} from '../src/client/theme.ts'

/**
 * jsdom ships no CSS variable resolution, so these specs stand in for the
 * browser: the stub reads the declaration the probe carries and answers with
 * what a real engine would compute. That keeps the CONTRACT under test — an
 * unresolved var() and a missing token must both be rejected, an already
 * computed colour must pass through — without pretending jsdom is a browser.
 * Real resolution is exercised by the browser harness.
 */
function stubEngine(tokens: Record<string, string>): void {
  vi.spyOn(window, 'getComputedStyle').mockImplementation(((element: Element) => {
    const declared = (element as HTMLElement).style.getPropertyValue('color').trim()
    const match = /^var\((--[a-zA-Z0-9-]+)\)$/.exec(declared)
    const value = match === null ? declared : (tokens[match[1] ?? ''] ?? '')
    const resolved = value === '' || value.startsWith('var(') ? PROBE_SENTINEL : value
    return {
      color: resolved,
      // A real engine answers a missing token with the PROPERTY's initial
      // value, and transparent IS background-color's initial value. Modelling
      // that asymmetry is what stops a background probe from creeping back into
      // resolveToken: on a missing token it reports "rgba(0, 0, 0, 0)", which
      // used to pass as a colour and painted an invisible playhead, grid and
      // selection.
      backgroundColor: resolved === PROBE_SENTINEL ? 'rgba(0, 0, 0, 0)' : resolved,
    } as unknown as CSSStyleDeclaration
  }) as never)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolveToken', () => {
  it('passes an already computed colour through', () => {
    stubEngine({ '--probe-a': 'rgb(255, 0, 0)' })
    expect(resolveToken(document, '--probe-a')).toBe('rgb(255, 0, 0)')
  })

  it('passes a token whose var() chain the engine resolved', () => {
    // The regression this guards: reading the custom property instead hands
    // back the literal "var(--probe-a)", and a canvas silently drops it.
    stubEngine({ '--probe-b': 'rgb(0, 255, 0)' })
    expect(resolveToken(document, '--probe-b')).toBe('rgb(0, 255, 0)')
  })

  it('rejects a missing token instead of taking the inherited colour', () => {
    stubEngine({})
    expect(resolveToken(document, '--probe-missing')).toBeNull()
  })

  it('rejects a chain that never resolved', () => {
    stubEngine({ '--probe-c': 'var(--probe-missing)' })
    expect(resolveToken(document, '--probe-c')).toBeNull()
  })

  it('rejects a token the engine only answers with a transparent background', () => {
    // Regression: the live light skin ships no --dsw-alias-accent / -hairline.
    // Reading background-color made those resolve to rgba(0, 0, 0, 0), so the
    // playhead was painted every frame in a fully transparent colour.
    stubEngine({ '--probe-known': 'rgb(15, 17, 21)' })
    expect(resolveToken(document, '--dsw-alias-accent')).toBeNull()
    expect(resolveToken(document, '--dsw-alias-hairline')).toBeNull()
  })
})

describe('withAlpha', () => {
  it('re-expresses computed and literal colours at a lower alpha', () => {
    expect(withAlpha('rgb(15, 17, 21)', 0.34)).toBe('rgba(15, 17, 21, 0.34)')
    expect(withAlpha('rgba(122, 162, 247, 0.95)', 0.55)).toBe('rgba(122, 162, 247, 0.55)')
    expect(withAlpha('#0f1115', 0.5)).toBe('rgba(15, 17, 21, 0.5)')
  })

  it('refuses anything it cannot parse', () => {
    expect(withAlpha('var(--nope)', 0.5)).toBeNull()
    expect(withAlpha('', 0.5)).toBeNull()
  })
})

describe('colorLuminance', () => {
  it('measures brightness', () => {
    expect(colorLuminance('rgb(255, 255, 255)')).toBeCloseTo(1, 6)
    expect(colorLuminance('rgb(0, 0, 0)')).toBeCloseTo(0, 6)
    expect(colorLuminance('rgba(255, 255, 255, 0.5)')).toBeCloseTo(1, 6)
  })

  it('refuses anything it cannot read', () => {
    expect(colorLuminance('var(--nope)')).toBeNull()
    expect(colorLuminance('')).toBeNull()
    expect(colorLuminance('rgb(a, b, c)')).toBeNull()
  })
})

describe('readPalette', () => {
  it('falls back to the dark palette when nothing resolves', () => {
    stubEngine({})
    const palette = readPalette(document)
    expect(palette.variant).toBe('dark')
    expect(palette.wave).toBe(DARK_FALLBACK.wave)
    expect(palette.text).toBe(DARK_FALLBACK.text)
  })

  it('reads a bright label colour as a dark skin', () => {
    stubEngine({ '--dsw-alias-label-primary': 'rgb(240, 240, 245)' })
    const palette = readPalette(document)
    expect(palette.variant).toBe('dark')
    expect(palette.wavePeak).toBe(withAlpha(DARK_FALLBACK.wave, 0.28))
    expect(palette.waveRms).toBe(withAlpha(DARK_FALLBACK.wave, 0.78))
  })

  it('falls back for the tokens a skin does not define instead of painting nothing', () => {
    stubEngine({ '--dsw-alias-label-primary': 'rgb(15, 17, 21)' })
    const palette = readPalette(document)
    expect(palette.playhead).toBe(LIGHT_FALLBACK.playhead)
    expect(palette.grid).toBe(LIGHT_FALLBACK.grid)
    expect(palette.selectionEdge).toBe(LIGHT_FALLBACK.selectionEdge)
  })

  it('keeps the RMS body distinguishable when a skin paints label and brand alike', () => {
    // The live light skin sets both to near-black; reading RMS from the label
    // token then filled the lane with a solid block of the waveform colour, and
    // the peaks disappeared into it.
    stubEngine({
      '--dsw-alias-label-primary': 'rgb(15, 17, 21)',
      '--dsw-alias-brand-primary': 'rgb(15, 17, 21)',
    })
    const palette = readPalette(document)
    expect(palette.variant).toBe('light')
    expect(palette.wave).toBe('rgb(15, 17, 21)')
    expect(palette.wavePeak).toBe('rgba(15, 17, 21, 0.22)')
    expect(palette.waveRms).toBe('rgba(15, 17, 21, 0.82)')
    // Same hue, three distinct alphas: transients read as a light band, the
    // sustained core as a dark one, and neither is the raw waveform colour.
    expect(new Set([palette.wave, palette.wavePeak, palette.waveRms]).size).toBe(3)
  })

  it('reads a dark label colour as a light skin', () => {
    stubEngine({ '--dsw-alias-label-primary': 'rgb(20, 22, 28)' })
    const palette = readPalette(document)
    expect(palette.variant).toBe('light')
    expect(palette.wave).toBe(LIGHT_FALLBACK.wave)
    expect(palette.playhead).toBe(LIGHT_FALLBACK.playhead)
  })

  it('prefers theme tokens over the fallbacks', () => {
    stubEngine({
      '--dsw-alias-label-primary': 'rgb(20, 22, 28)',
      '--dsw-alias-brand-primary': 'rgb(10, 90, 200)',
      '--dsw-alias-accent': 'rgb(200, 40, 10)',
    })
    const palette = readPalette(document)
    expect(palette.wave).toBe('rgb(10, 90, 200)')
    expect(palette.playhead).toBe('rgb(200, 40, 10)')
    expect(palette.variant).toBe('light')
  })
})
