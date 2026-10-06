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
    headers: Record<string, string | string[] | undefined>;
}
/**
 * Whether a hostname names the local loopback authority.
 * @param hostname - normalized hostname (no port).
 * @returns true for `localhost`, IPv6 loopback, or any `127.x.x.x` literal.
 */
export declare function isLoopbackHostname(hostname: string): boolean;
/**
 * Decide whether one request may reach the audio routes.
 * @param request - the request headers (Host / Origin / sec-fetch-site).
 * @param trustedHosts - non-loopback authorities this deployment serves.
 * @returns true when the Host is ours (loopback or trusted), no cross-site
 *   marker is present, and an attached Origin names this same hostname.
 */
export declare function isTrustedAudioRequest(request: FenceRequest, trustedHosts: readonly string[]): boolean;
