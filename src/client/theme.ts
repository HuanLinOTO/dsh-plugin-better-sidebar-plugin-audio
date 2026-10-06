/**
 * The canvas palette.
 *
 * A canvas cannot resolve var() itself, so every token is resolved through a
 * throwaway probe element: the token is set as a real CSS declaration on the
 * probe and the BROWSER's computed value is read back. Reading the custom
 * property directly instead would hand back a literal "var(--something)"
 * whenever the host defines one token in terms of another, and a canvas
 * silently ignores such a colour — which is exactly how labels end up
 * black-on-dark or invisible.
 *
 * The variant (dark / light) is derived from the resolved label colour, so the
 * hard-coded fallbacks used when a token is missing still match the active
 * skin instead of assuming a dark one.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/theme
 */

/** Which skin the palette was built for. */
export type ThemeVariant = 'dark' | 'light'

/** Every colour the canvases use. */
export interface CanvasPalette {
  /** Skin the palette matches. */
  variant: ThemeVariant
  /** Waveform colour the two layers below are derived from. */
  wave: string
  /** Peak band — the whole [min, max] range of each column, drawn light. */
  wavePeak: string
  /** RMS body — the solid core, drawn dark on top of the peak band. */
  waveRms: string
  /** Time grid lines. */
  grid: string
  /** Zero-axis line. */
  axis: string
  /** Playhead. */
  playhead: string
  /** Selection band. */
  selection: string
  /** Selection border. */
  selectionEdge: string
  /** Axis labels. */
  text: string
  /** Spectrum bars / line. */
  spectrum: string
  /** Spectrum fill under the line. */
  spectrumFill: string
  /** Spectrum grid and frequency ruler. */
  spectrumGrid: string
  /** Peak-marker accent. */
  accent: string
}

/** Dark-skin fallbacks (used only when a token does not resolve). */
export const DARK_FALLBACK: CanvasPalette = {
  variant: 'dark',
  wave: 'rgba(122, 162, 247, 0.95)',
  wavePeak: 'rgba(122, 162, 247, 0.28)',
  waveRms: 'rgba(122, 162, 247, 0.78)',
  grid: 'rgba(170, 182, 204, 0.20)',
  axis: 'rgba(170, 182, 204, 0.45)',
  playhead: '#ff9a6c',
  selection: 'rgba(122, 162, 247, 0.20)',
  selectionEdge: 'rgba(122, 162, 247, 0.80)',
  text: 'rgba(219, 226, 240, 0.90)',
  spectrum: 'rgba(126, 231, 190, 0.92)',
  spectrumFill: 'rgba(126, 231, 190, 0.24)',
  spectrumGrid: 'rgba(170, 182, 204, 0.16)',
  accent: '#ffc27a',
}

/** Light-skin fallbacks. */
export const LIGHT_FALLBACK: CanvasPalette = {
  variant: 'light',
  wave: 'rgba(37, 99, 190, 0.92)',
  wavePeak: 'rgba(37, 99, 190, 0.22)',
  waveRms: 'rgba(37, 99, 190, 0.82)',
  grid: 'rgba(52, 62, 82, 0.20)',
  axis: 'rgba(52, 62, 82, 0.45)',
  playhead: '#c2410c',
  selection: 'rgba(37, 99, 190, 0.16)',
  selectionEdge: 'rgba(37, 99, 190, 0.75)',
  text: 'rgba(38, 46, 60, 0.92)',
  spectrum: 'rgba(13, 118, 92, 0.95)',
  spectrumFill: 'rgba(13, 118, 92, 0.20)',
  spectrumGrid: 'rgba(52, 62, 82, 0.14)',
  accent: '#a1560a',
}

/** Token -> palette-slot mapping (all read as a colour, so alpha is preserved). */
const TOKEN_MAP: ReadonlyArray<readonly [Exclude<keyof CanvasPalette, 'variant'>, string]> = [
  ['wave', '--dsw-alias-brand-primary'],
  ['grid', '--dsw-alias-hairline'],
  ['axis', '--dsw-alias-border-l2'],
  ['playhead', '--dsw-alias-accent'],
  ['selection', '--dsw-alias-accent-soft'],
  ['selectionEdge', '--dsw-alias-accent'],
  ['text', '--dsw-alias-label-secondary'],
  ['spectrum', '--dsw-alias-state-success-primary'],
  ['spectrumFill', '--dsw-alias-state-success-tertiary'],
  ['spectrumGrid', '--dsw-alias-hairline'],
  ['accent', '--dsw-alias-state-warn-primary'],
]

/**
 * Sentinel inherited by a probe whose var() did not resolve. Exported so the
 * tests can describe the missing-token contract instead of hard-coding it.
 */
export const PROBE_SENTINEL = 'rgb(1, 2, 3)'

/**
 * Resolve one CSS custom property to a concrete colour.
 * @param doc - document owning the tokens.
 * @param token - custom property name (--dsw-alias-…).
 * @param scope - element the probe inherits from; the tokens must be read
 *   where the VIEWER lives, not from the document root, because a skin can be
 *   scoped to any ancestor (and two panels can carry different skins at once).
 * @returns the computed colour, or null when the token is missing / invalid.
 */
export function resolveToken(doc: Document, token: string, scope?: Element | null | undefined): string | null {
  const root = scope ?? doc.body ?? doc.documentElement
  if (root === null) return null
  const holder = doc.createElement('div')
  holder.setAttribute('aria-hidden', 'true')
  holder.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:0;height:0;'
    + 'color:' + PROBE_SENTINEL + ';'
  const probe = doc.createElement('span')
  probe.style.setProperty('color', 'var(' + token + ')')
  holder.appendChild(probe)
  root.appendChild(holder)
  let color = ''
  try {
    color = doc.defaultView?.getComputedStyle(probe).color ?? ''
  } catch {
    color = ''
  } finally {
    holder.remove()
  }
  const candidate = color.trim()
  // A missing token makes the declaration invalid at computed-value time, so
  // the probe falls back to the colour it inherits from the holder — the
  // sentinel. An unresolved chain still carries the literal var() text.
  //
  // Only `color` is probed, never `background-color`. A background probe cannot
  // tell a missing token from a legitimate transparent, because transparent IS
  // that property's initial value: an undefined token reads back as
  // "rgba(0, 0, 0, 0)", which passes every "is this a colour?" check and hands
  // the palette a playhead / grid / selection colour that paints nothing at all.
  if (candidate === '' || candidate === PROBE_SENTINEL || candidate.startsWith('var(')) return null
  return candidate
}

/**
 * Perceived brightness of a resolved CSS colour.
 * @param color - a computed rgb() / rgba() string.
 * @returns 0 (black) .. 1 (white), or null when unparsable.
 */
export function colorLuminance(color: string): number | null {
  const match = /^rgba?\(([^)]+)\)$/i.exec(color.trim())
  if (match === null) return null
  const parts = (match[1] ?? '').split(/[,\s/]+/).filter(part => part !== '')
  const [r, g, b] = parts.slice(0, 3).map(Number)
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null
  return (0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number)) / 255
}

/**
 * Re-express an opaque colour at a lower alpha.
 * @param color - a computed rgb() / rgba() colour, or a #rgb / #rrggbb literal.
 * @param alpha - 0..1, clamped.
 * @returns the rgba() string, or null when the colour cannot be parsed.
 */
export function withAlpha(color: string, alpha: number): string | null {
  const value = Math.min(1, Math.max(0, alpha))
  const text = color.trim()
  const functional = /^rgba?\(([^)]+)\)$/i.exec(text)
  if (functional !== null) {
    const parts = (functional[1] ?? '').split(/[,\s/]+/).filter(part => part !== '')
    const [r, g, b] = parts.slice(0, 3).map(Number)
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null
    return 'rgba(' + String(r) + ', ' + String(g) + ', ' + String(b) + ', ' + String(value) + ')'
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)
  if (hex === null) return null
  const body = hex[1] ?? ''
  const full = body.length === 3 ? body.split('').map(part => part + part).join('') : body
  const packed = Number.parseInt(full, 16)
  if (!Number.isFinite(packed)) return null
  return 'rgba(' + String((packed >> 16) & 255) + ', ' + String((packed >> 8) & 255)
    + ', ' + String(packed & 255) + ', ' + String(value) + ')'
}

/**
 * Whether the environment asks for a light skin (fallback signal only).
 * @param doc - document to measure.
 * @returns true when the light colour scheme matches.
 */
function prefersLight(doc: Document): boolean {
  try {
    return doc.defaultView?.matchMedia('(prefers-color-scheme: light)').matches ?? false
  } catch {
    return false
  }
}

/**
 * Read the palette for the skin in force where the viewer lives.
 * @param source - the viewer's own container element (preferred), or a
 *   document to read from the root. Defaults to the ambient document.
 * @returns the palette; tokens win, per-variant fallbacks fill the gaps.
 */
export function readPalette(source?: Element | Document | null | undefined): CanvasPalette {
  const doc = source instanceof Document
    ? source
    : (source?.ownerDocument ?? (typeof document === 'undefined' ? undefined : document))
  if (doc === undefined || (doc.body ?? doc.documentElement) === null) return DARK_FALLBACK
  const scope = source instanceof Element ? source : null
  const label = resolveToken(doc, '--dsw-alias-label-primary', scope)
  const luminance = label === null ? null : colorLuminance(label)
  // Bright text means a dark skin, and vice versa. Without a label colour the
  // environment preference is the only signal left.
  const variant: ThemeVariant = luminance === null
    ? (prefersLight(doc) ? 'light' : 'dark')
    : (luminance > 0.5 ? 'dark' : 'light')
  const base = variant === 'dark' ? DARK_FALLBACK : LIGHT_FALLBACK
  const palette: CanvasPalette = { ...base }
  for (const [slot, token] of TOKEN_MAP) {
    const resolved = resolveToken(doc, token, scope)
    if (resolved !== null) palette[slot] = resolved
  }
  palette.variant = variant
  // Both layers are DERIVED from the waveform colour, never read from tokens of
  // their own. The host's label colour equals its brand colour on some skins
  // (both near-black on the light one), so mapping the body to a label token
  // painted a solid block of exactly the waveform colour on top of the
  // waveform — the lane read as one dark smear with invisible peaks.
  //
  // Peak light, body dark. The split is what makes a normalised song readable
  // end to end: two alphas of one hue stay in the skin's palette while still
  // telling transients apart from sustained energy.
  const peak = withAlpha(palette.wave, variant === 'dark' ? 0.28 : 0.22)
  if (peak !== null) palette.wavePeak = peak
  const rms = withAlpha(palette.wave, variant === 'dark' ? 0.78 : 0.82)
  if (rms !== null) palette.waveRms = rms
  return palette
}
