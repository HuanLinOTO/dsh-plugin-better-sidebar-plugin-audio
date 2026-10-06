/**
 * @huanlin/dsh-plugin-better-sidebar-plugin-audio — client half.
 *
 * Registers ONE file viewer with better-sidebar for the audio extensions
 * (`audio-exts.ts`), at a priority above the built-in `code` catch-all
 * (-100) and above the built-in markdown/html viewers (0), so an audio file
 * opened from the file tree, the chat, or a path input lands in the waveform
 * player instead of the text editor's binary download pane.
 *
 * The viewer fetches its bytes from the host half's own Range route, so
 * playback streams and seeking works for files of any size; `load()` only
 * probes the file's facts (size, name, type).
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client
 */
import type { Context } from '@deepseek-ai/cordis';
/** The file viewer id (unique across the sidebar's registry). */
export declare const VIEWER_ID = "dsh-audio-preview:audio";
/** Priority: above the built-in markdown/html (0) and `code` catch-all (-100). */
export declare const VIEWER_PRIORITY = 50;
/**
 * Services required before mounting: the sidebar's registry service. When
 * better-sidebar is absent the plugin simply never activates (it is an
 * optional peer), which is the documented opt-in contract.
 */
export declare const inject: string[];
/** Plugin identity for loader diagnostics. */
export declare const name = "dsh-plugin-better-sidebar-plugin-audio";
/**
 * Register the audio file viewer.
 * @param ctx - the client plugin context (better-sidebar ready per {@link inject}).
 */
export declare function apply(ctx: Context): void;
