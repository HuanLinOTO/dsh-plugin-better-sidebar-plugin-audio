/**
 * The playback engine: one `<audio>` element (so playback streams through the
 * host route's Range responses and seeking stays native) wired into Web Audio
 * for the analyser the spectrum reads. The AudioContext is created lazily on
 * the first play — browsers require a user gesture, and a viewer that is only
 * looked at should not open one.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/player
 */
/** How far the audio graph got. */
export type PlayerContextState = 'idle' | 'running' | 'suspended' | 'failed';
/** One playing file. */
export interface Player {
    /** The media element (volume, rate, loop and `currentTime` live here). */
    readonly element: HTMLAudioElement;
    /** Analyser for the spectrum, or null when Web Audio is unavailable. */
    readonly analyser: AnalyserNode | null;
    /** Context state, for the "spectrum disabled" hint. */
    readonly contextState: PlayerContextState;
    /** Create the audio graph if needed (called by `play` and by the spectrum). */
    ensureContext(): boolean;
    /** Copy the current magnitudes, or null without an analyser. */
    bins(): Uint8Array | null;
    /** Start playback, resuming the context inside the user gesture. */
    play(): Promise<void>;
    /** Pause playback. */
    pause(): void;
    /** Tear the audio graph and the element down. */
    dispose(): void;
}
/** Test seams / extensions. */
export interface PlayerOptions {
    /** Build the AudioContext (defaults to `new AudioContext()`). */
    audioContextFactory?: (() => AudioContext | null) | undefined;
    /** Build the media element (defaults to `new Audio()`). */
    elementFactory?: (() => HTMLAudioElement) | undefined;
}
/**
 * Create a player for one URL.
 * @param url - the media URL (the plugin's Range route).
 * @param options - test seams.
 * @returns the player; call {@link Player.dispose} on unmount.
 */
export declare function createPlayer(url: string, options?: PlayerOptions): Player;
