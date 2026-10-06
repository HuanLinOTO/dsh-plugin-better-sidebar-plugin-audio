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

import type {} from 'dsh-better-sidebar'
import type { Context } from '@deepseek-ai/cordis'
import type { FileViewerProps } from 'dsh-better-sidebar/client/service'
import { AUDIO_EXTS } from '../audio-exts.ts'
import { AudioViewer } from './AudioViewer.tsx'
import { pickLang } from './labels.ts'
import { loadAudioSource, type ViewerData } from './source.ts'
import { ensureViewerStyles } from './styles.ts'

/** The file viewer id (unique across the sidebar's registry). */
export const VIEWER_ID = 'dsh-audio-preview:audio'

/** Priority: above the built-in markdown/html (0) and `code` catch-all (-100). */
export const VIEWER_PRIORITY = 50

/**
 * Services required before mounting: the sidebar's registry service. When
 * better-sidebar is absent the plugin simply never activates (it is an
 * optional peer), which is the documented opt-in contract.
 */
export const inject = ['betterSidebar']

/** Plugin identity for loader diagnostics. */
export const name = 'dsh-plugin-better-sidebar-plugin-audio'

/** Viewer name shown in the sidebar's settings list. */
function viewerTitle(): string {
  return pickLang(typeof navigator === 'undefined' ? undefined : navigator.languages) === 'zh'
    ? '音频预览'
    : 'Audio preview'
}

/** Small speaker glyph (drawn with `currentColor`, so it follows the skin). */
function AudioIcon(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M8.5 2.2 5 5.2H2.8v5.6H5l3.5 3V2.2Z"
        fill="currentColor"
      />
      <path
        d="M10.6 5.4a3.4 3.4 0 0 1 0 5.2M12.4 3.4a6 6 0 0 1 0 9.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Register the audio file viewer.
 * @param ctx - the client plugin context (better-sidebar ready per {@link inject}).
 */
export function apply(ctx: Context): void {
  const betterSidebar = ctx.betterSidebar
  if (betterSidebar === undefined) return
  ensureViewerStyles()
  ctx.effect(() => betterSidebar.registerFileViewer({
    id: VIEWER_ID,
    title: viewerTitle,
    icon: (size: number) => AudioIcon(size),
    exts: AUDIO_EXTS,
    priority: VIEWER_PRIORITY,
    fetchStrategy: 'custom',
    load: (path: string, scope: { sessionId: string; cwd?: string | undefined }, signal?: AbortSignal) =>
      loadAudioSource(path, { sessionId: scope.sessionId, cwd: scope.cwd }, signal),
    component: (props: FileViewerProps) => (
      <AudioViewer data={props.customData as ViewerData} />
    ),
  }), 'dsh-audio-preview: file viewer')
}
