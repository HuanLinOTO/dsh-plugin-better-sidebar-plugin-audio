/**
 * The plugin's HTTP surface: a read-only, Range-capable media route for audio
 * files, plus a metadata probe. Two endpoints under one prefix:
 *
 *   GET  /audio-preview/meta?sessionId&path&cwd   → JSON file facts (size, mime)
 *   GET  /audio-preview/media?sessionId&path&cwd  → bytes, honors `Range` (206)
 *   HEAD /audio-preview/media?...                 → headers only (size probe)
 *
 * Why not better-sidebar's own `/sidebar/file` media route? It reads the whole
 * file into memory, answers a plain `200` without `Accept-Ranges` (so a
 * browser disables scrubbing and a long recording cannot be jumped around
 * in), and is capped by that plugin's 20 MB `mediaLimit`. A waveform player
 * needs none of those constraints: this route streams with
 * `createReadStream`, honors `Range` (open-ended and suffix forms included)
 * and answers `416` with a `Content-Range` header naming the full size when a
 * range cannot be satisfied.
 *
 * Requests carry a `sessionId`; the session's authoritative `cwd` is used for
 * relative paths (client-supplied `cwd` is the fallback while the session is
 * still hydrating, `process.cwd()` the last resort). Absolute paths are used
 * as written — like better-sidebar's own file routes since v0.23.0, the cwd is
 * a base, not a boundary. `~` expands against the home directory. The route is
 * additionally narrowed to {@link AUDIO_EXTS}, so it cannot serve a
 * non-audio file at all.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/audio-route
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
/** Prefix both endpoints live under. */
export declare const ROUTE_PREFIX = "/audio-preview";
/** Metadata probe endpoint (JSON). */
export declare const META_PATH = "/audio-preview/meta";
/** Media endpoint (bytes, Range-capable). */
export declare const MEDIA_PATH = "/audio-preview/media";
/** One registered prefix route, as the host webserver service declares it. */
export interface WebServerRoute {
    kind: 'prefix';
    path: string;
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
}
/** The structural slice of the host context this half consumes. */
export interface AudioRouteContext {
    /** The web server registry (`ctx.webServer`). */
    webServer?: {
        register(route: WebServerRoute): () => void;
    } | undefined;
    /** The session store (`ctx.sessions`), read only for the authoritative cwd. */
    sessions?: {
        get(id: string): {
            header?: {
                cwd?: string;
            };
        } | undefined;
    } | undefined;
    /** The web runtime (`ctx.webRuntime`), read only for `trustedHosts`. */
    webRuntime?: {
        trustedHosts?: readonly string[];
    } | undefined;
}
/** Wire error with a stable code, mirroring better-sidebar's error envelope. */
export declare class AudioRouteError extends Error {
    /** Stable machine code (`forbidden` / `bad-request` / `unsupported-media` / …). */
    readonly code: string;
    /** HTTP status to answer with. */
    readonly status: number;
    constructor(code: string, message: string, status?: number);
}
/**
 * Parse a single `Range` header against a known size.
 * @param raw - the raw header value, or undefined when absent.
 * @param size - file size in bytes.
 * @returns `null` when no range is present or the header is unparsable (per
 *   RFC 9110 an unparsable Range header is ignored and the whole file served),
 *   `'unsatisfiable'` when the range lies outside the file, or the inclusive
 *   `{ start, end }` byte window. Multi-range requests are answered with the
 *   first range only, which the spec explicitly permits.
 */
export declare function parseRange(raw: string | undefined, size: number): {
    start: number;
    end: number;
} | 'unsatisfiable' | null;
/**
 * Resolve one request path against a base directory.
 * @param raw - the `path` query parameter (absolute, relative, or `~`-anchored).
 * @param cwd - base directory for relative paths.
 * @returns the absolute, lexically normalized path.
 * @throws {AudioRouteError} when the parameter is empty.
 */
export declare function resolveMediaPath(raw: string, cwd: string): string;
/**
 * Resolve the session's authoritative working directory.
 * @param sessions - the session store face (may be absent during hydration).
 * @param sessionId - the requesting session.
 * @param clientCwd - the caller's own cwd, used while the session is detached.
 * @returns the cwd to resolve relative paths against.
 */
export declare function sessionCwdOf(sessions: AudioRouteContext['sessions'], sessionId: string, clientCwd: string | undefined): string;
/** File facts answered by the metadata probe. */
export interface AudioFileFacts {
    /** Absolute path that was served. */
    path: string;
    /** File name. */
    name: string;
    /** Size in bytes. */
    size: number;
    /** Media type. */
    mime: string;
}
/**
 * Resolve, validate and stat the file one request names.
 * @param url - the parsed request URL.
 * @param ctx - the host context slice.
 * @returns the absolute path and its file facts.
 * @throws {AudioRouteError} for a missing parameter, a non-audio path, a
 *   missing file, or a non-regular file.
 */
export declare function statRequestedFile(url: URL, ctx: AudioRouteContext): Promise<AudioFileFacts>;
/**
 * Dispatch one request against the prefix route.
 * @param request - node request.
 * @param response - node response.
 * @param ctx - the host context slice.
 */
export declare function handleAudioRequest(request: IncomingMessage, response: ServerResponse, ctx: AudioRouteContext): Promise<void>;
/**
 * Register the media routes on the host webserver.
 * @param ctx - the host context slice.
 * @returns the disposer that unregisters the route.
 */
export declare function registerAudioRoutes(ctx: AudioRouteContext): () => void;
