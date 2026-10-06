/**
 * Spectrogram (waterfall) buffer: a pure ring of rows plus the magnitude ->
 * colour transfer, kept apart from any canvas so both are testable. The colour
 * ramp follows the active skin — a light skin inverts it so weak energy stays
 * near the background colour instead of glowing white on white.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/waterfall
 */
import type { ThemeVariant } from './theme.ts';
/**
 * Map one magnitude onto an RGB triple.
 * @param magnitude - column magnitude in 0..1.
 * @param variant - active skin; the ramp inverts for a light one.
 * @returns a triple, each component 0..255.
 */
export declare function magnitudeColor(magnitude: number, variant?: ThemeVariant): readonly [number, number, number];
/**
 * A fixed-size grid of spectrum rows: newest row last, oldest dropped.
 * Row-major byte array of width * height cells, one byte per cell.
 */
export declare class WaterfallBuffer {
    /** Grid width in pixels (spectrum columns). */
    readonly width: number;
    /** Grid height in pixels (history depth). */
    readonly height: number;
    private readonly pixels;
    private filled;
    constructor(width: number, height: number);
    /** How many rows have been written (capped at the grid height). */
    get rows(): number;
    /**
     * Push one spectrum row, scrolling the older rows up.
     * @param values - one magnitude per column (0..1); short input is zero-padded.
     */
    push(values: Float32Array | readonly number[]): void;
    /** Drop all history. */
    clear(): void;
    /**
     * Read one magnitude back.
     * @param column - column index.
     * @param row - row index (0 = oldest).
     * @returns the stored magnitude in 0..1, or 0 outside the grid.
     */
    at(column: number, row: number): number;
    /**
     * Render the grid into an RGBA buffer.
     * @param out - destination of width * height * 4 bytes (may be reused).
     * @param variant - active skin (the ramp inverts for a light one).
     * @returns the same buffer, filled.
     */
    render(out: Uint8ClampedArray, variant?: ThemeVariant): Uint8ClampedArray;
}
