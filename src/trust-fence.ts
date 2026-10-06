/**
 * Browser-trust fence for the plugin's media routes, behaviorally identical to
 * dsh-better-sidebar's `/sidebar/*` fence (and to the `/api` gateway's fence in
 * `@deepseek-ai/dsh-client-connection`, from which both derive): a loopback
 * Host header (or one of the web runtime's trusted authorities) plus
 * same-origin browser markers pass; cross-site markers refuse. It is a
 * DNS-rebinding / cross-site defence, not authentication.
 *
 * The audio route adds a second, independent narrowing of its own: only the
 * extensions in `audio-exts.ts` are served, so even a page that got past the
 * fence cannot turn this route into a generic file reader.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/trust-fence
 */

/** The request facts the fence reads (structural subset of IncomingMessage). */
export interface FenceRequest {
  headers: Record<string, string | string[] | undefined>
}

/**
 * Origin of the Electron desktop shell's application page. The shell serves
 * its GUI from the `dsh-app:` scheme and forwards only its own page requests,
 * so a page-initiated media request carries this origin while its Host is the
 * Host's loopback authority — an authority match is impossible by construction.
 */
const SHELL_APP_ORIGIN = 'dsh-app://app'

function header(headers: FenceRequest['headers'], name: string): string | undefined {
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

/** Normalized URL of a Host-header authority, or undefined when unparsable. */
function parseAuthority(authority: string): URL | undefined {
  try {
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

/**
 * Whether a hostname names the local loopback authority.
 * @param hostname - normalized hostname (no port).
 * @returns true for `localhost`, IPv6 loopback, or any `127.x.x.x` literal.
 */
export function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/** Canonical authority form: hostname alone, or hostname:port when a port was written. */
function canonicalAuthority(entry: string, entryUrl: URL): string {
  const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port
  return port === '' ? entryUrl.hostname : `${entryUrl.hostname}:${port}`
}

/** Whether the request authority matches a trustedHosts entry (exact, or port-agnostic). */
function isTrustedAuthority(hostUrl: URL, trustedHosts: readonly string[]): boolean {
  return trustedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry)
    if (entryUrl === undefined) return false
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host
  })
}

/**
 * Decide whether one request may reach the audio routes.
 * @param request - the request headers (Host / Origin / sec-fetch-site).
 * @param trustedHosts - non-loopback authorities this deployment serves.
 * @returns true when the Host is ours (loopback or trusted), no cross-site
 *   marker is present, and an attached Origin names this same hostname.
 */
export function isTrustedAudioRequest(request: FenceRequest, trustedHosts: readonly string[]): boolean {
  const host = header(request.headers, 'host')
  if (host === undefined) return false
  const hostUrl = parseAuthority(host)
  if (hostUrl === undefined) return false
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false
  // Cross-site markers: the media element sends `sec-fetch-site: same-origin`
  // for our own pages, so a cross-site marker can only come from elsewhere.
  if (header(request.headers, 'sec-fetch-site') === 'cross-site') return false
  const origin = header(request.headers, 'origin')
  // Absent Origin is fine: the Host fence above already bound the request
  // (non-browser clients such as curl send none).
  if (origin === undefined) return true
  if (origin === SHELL_APP_ORIGIN) return true
  try {
    // Hostname, not host: some Chromium builds serialize the Origin of a
    // non-default-port loopback page without the port.
    return new URL(origin).hostname === hostUrl.hostname
  } catch {
    // The literal "null" (sandboxed iframes, file: pages) is an opaque origin.
    return false
  }
}
