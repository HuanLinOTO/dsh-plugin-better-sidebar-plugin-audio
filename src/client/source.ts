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
export const ROUTE_PREFIX = '/audio-preview'

/** Everything the viewer needs to play one file. */
export interface AudioSourceFacts {
  /** Range-capable media URL. */
  url: string
  /** Absolute path as the host resolved it. */
  path: string
  /** File name. */
  name: string
  /** Size in bytes. */
  size: number
  /** Media type reported by the host. */
  mime: string
  /** Session the request is scoped to. */
  sessionId: string
}

/** Loading failed; the viewer renders the message instead of a player. */
export interface AudioSourceError {
  /** User-facing reason. */
  error: string
}

/** What `load()` hands to the viewer component. */
export type ViewerData = AudioSourceFacts | AudioSourceError

/**
 * Narrow a {@link ViewerData} to its failure branch.
 * @param data - the loaded value.
 * @returns true when loading failed.
 */
export function isSourceError(data: ViewerData): data is AudioSourceError {
  return typeof (data as AudioSourceError).error === 'string'
}

/**
 * Build the query string the host route expects.
 * @param params - session, path and optional cwd fallback.
 * @returns an encoded query string.
 */
export function audioQuery(params: { sessionId: string; path: string; cwd?: string | undefined }): string {
  const search = new URLSearchParams()
  search.set('sessionId', params.sessionId)
  search.set('path', params.path)
  if (params.cwd !== undefined && params.cwd !== '') search.set('cwd', params.cwd)
  return search.toString()
}

/**
 * Build one route URL.
 * @param kind - `meta` or `media`.
 * @param params - session, path and optional cwd fallback.
 * @returns the URL to fetch.
 */
export function buildAudioUrl(kind: 'meta' | 'media', params: { sessionId: string; path: string; cwd?: string | undefined }): string {
  return `${ROUTE_PREFIX}/${kind}?${audioQuery(params)}`
}

/** Shape of the host route's JSON envelope. */
interface RouteEnvelope {
  ok?: boolean
  value?: { path?: unknown; name?: unknown; size?: unknown; mime?: unknown }
  error?: { code?: unknown; message?: unknown }
}

/**
 * Resolve a file to a playable source.
 * @param path - the path better-sidebar opened.
 * @param scope - the session scope (id, and a cwd fallback when present).
 * @param signal - aborts the probe when the viewer unmounts.
 * @returns the source facts, or the failure to display.
 */
export async function loadAudioSource(
  path: string,
  scope: { sessionId: string; cwd?: string | undefined },
  signal?: AbortSignal,
): Promise<ViewerData> {
  const params = { sessionId: scope.sessionId, path, cwd: scope.cwd }
  try {
    const response = await fetch(buildAudioUrl('meta', params), {
      signal,
      headers: { accept: 'application/json' },
    })
    const envelope = (await response.json().catch(() => null)) as RouteEnvelope | null
    if (envelope === null || envelope.ok !== true || typeof envelope.value !== 'object' || envelope.value === null) {
      const message = typeof envelope?.error?.message === 'string' ? envelope.error.message : `HTTP ${response.status}`
      return { error: message }
    }
    const value = envelope.value
    return {
      url: buildAudioUrl('media', params),
      path: typeof value.path === 'string' ? value.path : path,
      name: typeof value.name === 'string' ? value.name : path,
      size: typeof value.size === 'number' ? value.size : 0,
      mime: typeof value.mime === 'string' ? value.mime : 'audio/*',
      sessionId: scope.sessionId,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return { error: 'aborted' }
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
