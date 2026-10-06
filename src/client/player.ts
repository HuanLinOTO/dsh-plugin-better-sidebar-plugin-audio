/**
 * The playback engine: one `<audio>` element (so playback streams through the
 * host route's Range responses and seeking stays native) wired into Web Audio
 * for the analyser the spectrum reads. The AudioContext is created lazily on
 * the first play — browsers require a user gesture, and a viewer that is only
 * looked at should not open one.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/player
 */

import { FFT_SIZE } from './spectrum.ts'

/** How far the audio graph got. */
export type PlayerContextState = 'idle' | 'running' | 'suspended' | 'failed'

/** One playing file. */
export interface Player {
  /** The media element (volume, rate, loop and `currentTime` live here). */
  readonly element: HTMLAudioElement
  /** Analyser for the spectrum, or null when Web Audio is unavailable. */
  readonly analyser: AnalyserNode | null
  /** Context state, for the "spectrum disabled" hint. */
  readonly contextState: PlayerContextState
  /** Create the audio graph if needed (called by `play` and by the spectrum). */
  ensureContext(): boolean
  /** Copy the current magnitudes, or null without an analyser. */
  bins(): Uint8Array | null
  /** Start playback, resuming the context inside the user gesture. */
  play(): Promise<void>
  /** Pause playback. */
  pause(): void
  /** Tear the audio graph and the element down. */
  dispose(): void
}

/** Test seams / extensions. */
export interface PlayerOptions {
  /** Build the AudioContext (defaults to `new AudioContext()`). */
  audioContextFactory?: (() => AudioContext | null) | undefined
  /** Build the media element (defaults to `new Audio()`). */
  elementFactory?: (() => HTMLAudioElement) | undefined
}

/** Construct the ambient AudioContext, or null when the platform has none. */
function defaultAudioContext(): AudioContext | null {
  const scope = globalThis as {
    AudioContext?: new () => AudioContext
    webkitAudioContext?: new () => AudioContext
  }
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext
  if (Ctor === undefined) return null
  return new Ctor()
}

/**
 * Create a player for one URL.
 * @param url - the media URL (the plugin's Range route).
 * @param options - test seams.
 * @returns the player; call {@link Player.dispose} on unmount.
 */
export function createPlayer(url: string, options: PlayerOptions = {}): Player {
  const element = options.elementFactory?.() ?? new Audio()
  element.src = url
  element.preload = 'metadata'
  let context: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let source: MediaElementAudioSourceNode | null = null
  // Typed over ArrayBuffer (not ArrayBufferLike) so it matches the DOM's
  // `getByteFrequencyData` parameter exactly.
  let bins: Uint8Array<ArrayBuffer> | null = null
  let state: PlayerContextState = 'idle'
  let disposed = false

  const ensureContext = (): boolean => {
    if (disposed) return false
    if (context !== null) return analyser !== null
    let created: AudioContext | null = null
    try {
      created = options.audioContextFactory?.() ?? defaultAudioContext()
    } catch {
      created = null
    }
    if (created === null) {
      state = 'failed'
      return false
    }
    context = created
    try {
      const node = created.createAnalyser()
      node.fftSize = FFT_SIZE
      node.smoothingTimeConstant = 0.75
      const elementSource = created.createMediaElementSource(element)
      elementSource.connect(node)
      node.connect(created.destination)
      analyser = node
      source = elementSource
      bins = new Uint8Array(new ArrayBuffer(node.frequencyBinCount))
      state = created.state === 'running' ? 'running' : 'suspended'
      return true
    } catch {
      // A context that cannot host the graph is worse than none: drop it so
      // playback falls back to the element's own output.
      analyser = null
      source = null
      bins = null
      state = 'failed'
      try {
        void context.close()
      } catch {
        // Closing a half-built context is best-effort.
      }
      context = null
      return false
    }
  }

  return {
    element,
    get analyser(): AnalyserNode | null {
      return analyser
    },
    get contextState(): PlayerContextState {
      return state
    },
    ensureContext,
    bins(): Uint8Array | null {
      if (analyser === null || bins === null) return null
      analyser.getByteFrequencyData(bins)
      return bins
    },
    async play(): Promise<void> {
      const ready = ensureContext()
      if (ready && context !== null && context.state !== 'running') {
        try {
          await context.resume()
          // Re-read after the await: the guard above narrowed the pre-resume
          // state, so the comparison needs a fresh value to be meaningful.
          // Compared as a plain string: the guard above already narrowed
          // `context.state` to the non-running half of the union.
          const resumed: string = context.state
          state = resumed === 'running' ? 'running' : 'suspended'
        } catch {
          state = 'suspended'
        }
      }
      await element.play()
    },
    pause(): void {
      try {
        element.pause()
      } catch {
        // A detached element cannot pause; nothing to do.
      }
    },
    dispose(): void {
      disposed = true
      try {
        element.pause()
        element.removeAttribute('src')
        element.load()
      } catch {
        // jsdom and detached elements throw here; the element is discarded anyway.
      }
      try {
        source?.disconnect()
        analyser?.disconnect()
      } catch {
        // Disconnecting an already-dropped graph is fine.
      }
      const closing = context
      context = null
      analyser = null
      source = null
      bins = null
      if (closing !== null) {
        try {
          void closing.close()
        } catch {
          // Closing is best-effort.
        }
      }
    },
  }
}
