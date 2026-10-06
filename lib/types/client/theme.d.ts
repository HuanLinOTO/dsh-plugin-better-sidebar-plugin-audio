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
export type ThemeVariant = 'dark' | 'light';
/** Every colour the canvases use. */
export interface CanvasPalette {
    /** Skin the palette matches. */
    variant: ThemeVariant;
    /** Waveform colour the two layers below are derived from. */
    wave: string;
    /** Peak band — the whole [min, max] range of each column, drawn light. */
    wavePeak: string;
    /** RMS body — the solid core, drawn dark on top of the peak band. */
    waveRms: string;
    /** Time grid lines. */
    grid: string;
    /** Zero-axis line. */
    axis: string;
    /** Playhead. */
    playhead: string;
    /** Selection band. */
    selection: string;
    /** Selection border. */
    selectionEdge: string;
    /** Axis labels. */
    text: string;
    /** Spectrum bars / line. */
    spectrum: string;
    /** Spectrum fill under the line. */
    spectrumFill: string;
    /** Spectrum grid and frequency ruler. */
    spectrumGrid: string;
    /** Peak-marker accent. */
    accent: string;
}
/** Dark-skin fallbacks (used only when a token does not resolve). */
export declare const DARK_FALLBACK: CanvasPalette;
/** Light-skin fallbacks. */
export declare const LIGHT_FALLBACK: CanvasPalette;
/**
 * Sentinel inherited by a probe whose var() did not resolve. Exported so the
 * tests can describe the missing-token contract instead of hard-coding it.
 */
export declare const PROBE_SENTINEL = "rgb(1, 2, 3)";
/**
 * Resolve one CSS custom property to a concrete colour.
 * @param doc - document owning the tokens.
 * @param token - custom property name (--dsw-alias-…).
 * @param scope - element the probe inherits from; the tokens must be read
 *   where the VIEWER lives, not from the document root, because a skin can be
 *   scoped to any ancestor (and two panels can carry different skins at once).
 * @returns the computed colour, or null when the token is missing / invalid.
 */
export declare function resolveToken(doc: Document, token: string, scope?: Element | null | undefined): string | null;
/**
 * Perceived brightness of a resolved CSS colour.
 * @param color - a computed rgb() / rgba() string.
 * @returns 0 (black) .. 1 (white), or null when unparsable.
 */
export declare function colorLuminance(color: string): number | null;
/**
 * Re-express an opaque colour at a lower alpha.
 * @param color - a computed rgb() / rgba() colour, or a #rgb / #rrggbb literal.
 * @param alpha - 0..1, clamped.
 * @returns the rgba() string, or null when the colour cannot be parsed.
 */
export declare function withAlpha(color: string, alpha: number): string | null;
/**
 * Read the palette for the skin in force where the viewer lives.
 * @param source - the viewer's own container element (preferred), or a
 *   document to read from the root. Defaults to the ambient document.
 * @returns the palette; tokens win, per-variant fallbacks fill the gaps.
 */
export declare function readPalette(source?: Element | Document | null | undefined): CanvasPalette;
