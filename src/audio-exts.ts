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
export const AUDIO_EXTS = [
  'mp3',
  'wav',
  'wave',
  'ogg',
  'oga',
  'opus',
  'flac',
  'm4a',
  'aac',
  'wma',
  'aif',
  'aiff',
  'amr',
  'ape',
  'caf',
  'mka',
] as const

/** One known audio extension. */
export type AudioExt = (typeof AUDIO_EXTS)[number]

/** Membership test over {@link AUDIO_EXTS}. */
export const AUDIO_EXT_SET: ReadonlySet<string> = new Set<string>(AUDIO_EXTS)

/**
 * Whether one path carries an extension this plugin previews.
 * @param path - absolute or relative path (case-insensitive; extension only).
 * @returns true when the trailing extension is one of {@link AUDIO_EXTS}.
 */
export function isAudioPath(path: string): boolean {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const name = path.slice(slash + 1)
  const dot = name.lastIndexOf('.')
  // `dot > 0` keeps a dotfile (.mp3) from counting as an audio file, exactly
  // like the host's own extension tests.
  return dot > 0 && AUDIO_EXT_SET.has(name.slice(dot + 1).toLowerCase())
}

/** Media types served by the host route, by extension. */
const AUDIO_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  wave: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wma: 'audio/x-ms-wma',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  amr: 'audio/amr',
  ape: 'audio/x-ape',
  caf: 'audio/x-caf',
  mka: 'audio/x-matroska',
}

/**
 * Content type for one audio path.
 * @param path - path whose trailing extension selects the type.
 * @returns the audio media type, or `application/octet-stream` for an
 *   extension outside {@link AUDIO_EXTS}.
 */
export function contentTypeForAudio(path: string): string {
  const dot = path.lastIndexOf('.')
  if (dot === -1) return 'application/octet-stream'
  return AUDIO_TYPES[path.slice(dot + 1).toLowerCase()] ?? 'application/octet-stream'
}
