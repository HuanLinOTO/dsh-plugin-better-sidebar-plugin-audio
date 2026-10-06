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

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, isAbsolute, join, resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { contentTypeForAudio, isAudioPath } from './audio-exts.ts'
import { isTrustedAudioRequest } from './trust-fence.ts'

/** Prefix both endpoints live under. */
export const ROUTE_PREFIX = '/audio-preview'

/** Metadata probe endpoint (JSON). */
export const META_PATH = `${ROUTE_PREFIX}/meta`

/** Media endpoint (bytes, Range-capable). */
export const MEDIA_PATH = `${ROUTE_PREFIX}/media`

/** One registered prefix route, as the host webserver service declares it. */
export interface WebServerRoute {
  kind: 'prefix'
  path: string
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
}

/** The structural slice of the host context this half consumes. */
export interface AudioRouteContext {
  /** The web server registry (`ctx.webServer`). */
  webServer?: { register(route: WebServerRoute): () => void } | undefined
  /** The session store (`ctx.sessions`), read only for the authoritative cwd. */
  sessions?: { get(id: string): { header?: { cwd?: string } } | undefined } | undefined
  /** The web runtime (`ctx.webRuntime`), read only for `trustedHosts`. */
  webRuntime?: { trustedHosts?: readonly string[] } | undefined
}

/** Wire error with a stable code, mirroring better-sidebar's error envelope. */
export class AudioRouteError extends Error {
  /** Stable machine code (`forbidden` / `bad-request` / `unsupported-media` / …). */
  readonly code: string
  /** HTTP status to answer with. */
  readonly status: number

  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = 'AudioRouteError'
    this.code = code
    this.status = status
  }
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
export function parseRange(raw: string | undefined, size: number): { start: number; end: number } | 'unsatisfiable' | null {
  if (raw === undefined) return null
  const match = /^bytes=(.+)$/i.exec(raw.trim())
  if (match === null) return null
  const first = (match[1] ?? '').split(',')[0]?.trim() ?? ''
  if (first === '') return null
  if (first.startsWith('-')) {
    const suffix = Number(first.slice(1))
    if (!Number.isInteger(suffix) || suffix <= 0) return null
    if (size === 0) return 'unsatisfiable'
    if (suffix >= size) return { start: 0, end: size - 1 }
    return { start: size - suffix, end: size - 1 }
  }
  const dash = first.indexOf('-')
  if (dash <= 0) return null
  const startText = first.slice(0, dash)
  const endText = first.slice(dash + 1)
  const start = Number(startText)
  const end = endText === '' ? size - 1 : Number(endText)
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < 0) return null
  if (start >= size || end < start) return 'unsatisfiable'
  return { start, end: Math.min(end, size - 1) }
}

/**
 * Resolve one request path against a base directory.
 * @param raw - the `path` query parameter (absolute, relative, or `~`-anchored).
 * @param cwd - base directory for relative paths.
 * @returns the absolute, lexically normalized path.
 * @throws {AudioRouteError} when the parameter is empty.
 */
export function resolveMediaPath(raw: string, cwd: string): string {
  if (raw === '') throw new AudioRouteError('bad-request', 'path is required')
  let value = raw
  if (value === '~' || value.startsWith('~/') || value.startsWith('~\\')) value = join(homedir(), value.slice(1))
  return isAbsolute(value) ? resolve(value) : resolve(cwd, value)
}

/**
 * Resolve the session's authoritative working directory.
 * @param sessions - the session store face (may be absent during hydration).
 * @param sessionId - the requesting session.
 * @param clientCwd - the caller's own cwd, used while the session is detached.
 * @returns the cwd to resolve relative paths against.
 */
export function sessionCwdOf(
  sessions: AudioRouteContext['sessions'],
  sessionId: string,
  clientCwd: string | undefined,
): string {
  const headerCwd = sessions?.get(sessionId)?.header?.cwd
  if (typeof headerCwd === 'string' && headerCwd !== '') return headerCwd
  if (typeof clientCwd === 'string' && clientCwd !== '') return resolve(clientCwd)
  return process.cwd()
}

/** File facts answered by the metadata probe. */
export interface AudioFileFacts {
  /** Absolute path that was served. */
  path: string
  /** File name. */
  name: string
  /** Size in bytes. */
  size: number
  /** Media type. */
  mime: string
}

/** Error envelope body. */
interface ErrorBody {
  ok: false
  error: { code: string; message: string }
}

/** Answer one wire error (or destroy the response when headers already went out). */
function writeError(response: ServerResponse, status: number, code: string, message: string): void {
  if (response.headersSent) {
    response.destroy()
    return
  }
  const body = Buffer.from(JSON.stringify({ ok: false, error: { code, message } } satisfies ErrorBody), 'utf8')
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store',
  })
  response.end(body)
}

/** Answer one JSON value. */
function writeJson(response: ServerResponse, status: number, value: unknown): void {
  const body = Buffer.from(JSON.stringify({ ok: true, value }), 'utf8')
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store',
  })
  response.end(body)
}

/** Read one query parameter as a non-empty string. */
function requireParam(url: URL, name: string): string {
  const value = url.searchParams.get(name)
  if (value === null || value === '') throw new AudioRouteError('bad-request', `${name} is required`)
  return value
}

/**
 * Resolve, validate and stat the file one request names.
 * @param url - the parsed request URL.
 * @param ctx - the host context slice.
 * @returns the absolute path and its file facts.
 * @throws {AudioRouteError} for a missing parameter, a non-audio path, a
 *   missing file, or a non-regular file.
 */
export async function statRequestedFile(url: URL, ctx: AudioRouteContext): Promise<AudioFileFacts> {
  const sessionId = requireParam(url, 'sessionId')
  const raw = requireParam(url, 'path')
  const cwd = sessionCwdOf(ctx.sessions, sessionId, url.searchParams.get('cwd') ?? undefined)
  const path = resolveMediaPath(raw, cwd)
  if (!isAudioPath(path)) {
    const name = basename(path)
    const dot = name.lastIndexOf('.')
    const ext = dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
    throw new AudioRouteError(
      'unsupported-media',
      ext === ''
        ? 'this route serves audio files only'
        : `this route serves audio files only (got .${ext})`,
      403,
    )
  }
  let info
  try {
    info = await stat(path)
  } catch {
    throw new AudioRouteError('fs-error', `cannot read "${path}"`, 404)
  }
  if (!info.isFile()) throw new AudioRouteError('fs-error', `"${path}" is not a regular file`, 400)
  return { path, name: basename(path), size: info.size, mime: contentTypeForAudio(path) }
}

/** Answer the metadata probe. */
async function handleMeta(url: URL, ctx: AudioRouteContext, response: ServerResponse): Promise<void> {
  writeJson(response, 200, await statRequestedFile(url, ctx))
}

/** Answer a media request, streaming either the whole file or the requested range. */
async function handleMedia(url: URL, ctx: AudioRouteContext, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const facts = await statRequestedFile(url, ctx)
  const range = parseRange(request.headers.range, facts.size)
  const headers: Record<string, string> = {
    'content-type': facts.mime,
    'accept-ranges': 'bytes',
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
  }
  if (range === 'unsatisfiable') {
    response.writeHead(416, { ...headers, 'content-range': `bytes */${facts.size}` })
    response.end()
    return
  }
  const start = range === null ? 0 : range.start
  const end = range === null ? facts.size - 1 : range.end
  const length = range === null ? facts.size : end - start + 1
  if (range !== null) headers['content-range'] = `bytes ${start}-${end}/${facts.size}`
  headers['content-length'] = String(length)
  response.writeHead(range === null ? 200 : 206, headers)
  if (request.method === 'HEAD' || facts.size === 0) {
    response.end()
    return
  }
  const stream = createReadStream(facts.path, { start, end })
  // A closed tab must not leave a read stream behind.
  request.on('close', () => stream.destroy())
  stream.on('error', (error: Error) => {
    if (!response.headersSent) writeError(response, 500, 'fs-error', error.message)
    else response.destroy()
  })
  stream.pipe(response)
}

/**
 * Dispatch one request against the prefix route.
 * @param request - node request.
 * @param response - node response.
 * @param ctx - the host context slice.
 */
export async function handleAudioRequest(
  request: IncomingMessage,
  response: ServerResponse,
  ctx: AudioRouteContext,
): Promise<void> {
  if (!isTrustedAudioRequest({ headers: request.headers }, ctx.webRuntime?.trustedHosts ?? [])) {
    writeError(response, 403, 'forbidden', 'refused by the browser-trust fence')
    return
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' })
    response.end()
    return
  }
  const url = new URL(request.url ?? '/', 'http://dsh.internal')
  const pathname = url.pathname.replace(/\/+$/, '')
  try {
    if (pathname === META_PATH) {
      await handleMeta(url, ctx, response)
      return
    }
    if (pathname === MEDIA_PATH) {
      await handleMedia(url, ctx, request, response)
      return
    }
    writeError(response, 404, 'not-found', `unknown route ${url.pathname}`)
  } catch (error) {
    if (error instanceof AudioRouteError) writeError(response, error.status, error.code, error.message)
    else writeError(response, 500, 'internal', error instanceof Error ? error.message : String(error))
  }
}

/**
 * Register the media routes on the host webserver.
 * @param ctx - the host context slice.
 * @returns the disposer that unregisters the route.
 */
export function registerAudioRoutes(ctx: AudioRouteContext): () => void {
  const webServer = ctx.webServer
  if (webServer === undefined) return () => {}
  return webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: (request, response) => {
      void handleAudioRequest(request, response, ctx)
    },
  })
}
