/**
 * The client side of the plugin's own media route: resolve one file to a
 * playable URL and its facts. The host owns cwd resolution (it reads the
 * session's authoritative cwd), so the request only carries what the viewer
 * knows: the session id, the path as better-sidebar handed it over, and — when
 * the scope happens to carry one — a cwd fallback for the hydration window.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/source
 */
/** Route prefix registered by the host half. */
export declare const ROUTE_PREFIX = "/audio-preview";
/** Everything the viewer needs to play one file. */
export interface AudioSourceFacts {
    /** Range-capable media URL. */
    url: string;
    /** Absolute path as the host resolved it. */
    path: string;
    /** File name. */
    name: string;
    /** Size in bytes. */
    size: number;
    /** Media type reported by the host. */
    mime: string;
    /** Session the request is scoped to. */
    sessionId: string;
}
/** Loading failed; the viewer renders the message instead of a player. */
export interface AudioSourceError {
    /** User-facing reason. */
    error: string;
}
/** What `load()` hands to the viewer component. */
export type ViewerData = AudioSourceFacts | AudioSourceError;
/**
 * Narrow a {@link ViewerData} to its failure branch.
 * @param data - the loaded value.
 * @returns true when loading failed.
 */
export declare function isSourceError(data: ViewerData): data is AudioSourceError;
/**
 * Build the query string the host route expects.
 * @param params - session, path and optional cwd fallback.
 * @returns an encoded query string.
 */
export declare function audioQuery(params: {
    sessionId: string;
    path: string;
    cwd?: string | undefined;
}): string;
/**
 * Build one route URL.
 * @param kind - `meta` or `media`.
 * @param params - session, path and optional cwd fallback.
 * @returns the URL to fetch.
 */
export declare function buildAudioUrl(kind: 'meta' | 'media', params: {
    sessionId: string;
    path: string;
    cwd?: string | undefined;
}): string;
/**
 * Resolve a file to a playable source.
 * @param path - the path better-sidebar opened.
 * @param scope - the session scope (id, and a cwd fallback when present).
 * @param signal - aborts the probe when the viewer unmounts.
 * @returns the source facts, or the failure to display.
 */
export declare function loadAudioSource(path: string, scope: {
    sessionId: string;
    cwd?: string | undefined;
}, signal?: AbortSignal): Promise<ViewerData>;
