/**
 * The audio extensions this plugin owns — one source of truth for BOTH halves:
 * the host route's whitelist (a non-audio path is refused, so the route can
 * never be used as a generic file download) and the client viewer's `exts`
 * (which decides that a file open lands in this preview at all).
 *
 * None of these extensions is claimed by DSH's own document preview: the host
 * lists mp3/wav/flac/ogg/m4a/aac/wma/opus under "known binary, no renderer"
 * (`ui-sidebar-documentpreview/src/client/document/unviewable.ts`) and
 * better-sidebar's `HOST_OWNED_EXTS` hands over only spreadsheets, PDF,
 * images and Office — so this viewer is the one that answers.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/audio-exts
 */
/** Lower-case, dot-less audio extensions (shared by host and client). */
export declare const AUDIO_EXTS: readonly ["mp3", "wav", "wave", "ogg", "oga", "opus", "flac", "m4a", "aac", "wma", "aif", "aiff", "amr", "ape", "caf", "mka"];
/** One known audio extension. */
export type AudioExt = (typeof AUDIO_EXTS)[number];
/** Membership test over {@link AUDIO_EXTS}. */
export declare const AUDIO_EXT_SET: ReadonlySet<string>;
/**
 * Whether one path carries an extension this plugin previews.
 * @param path - absolute or relative path (case-insensitive; extension only).
 * @returns true when the trailing extension is one of {@link AUDIO_EXTS}.
 */
export declare function isAudioPath(path: string): boolean;
/**
 * Content type for one audio path.
 * @param path - path whose trailing extension selects the type.
 * @returns the audio media type, or `application/octet-stream` for an
 *   extension outside {@link AUDIO_EXTS}.
 */
export declare function contentTypeForAudio(path: string): string;
