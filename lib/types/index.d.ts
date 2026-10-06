/**
 * @huanlin/dsh-plugin-better-sidebar-plugin-audio — host half.
 *
 * One job: expose the Range-capable audio media route the client-side viewer
 * plays from (see `audio-route.ts` for why better-sidebar's own media route
 * cannot be used). The plugin contributes no page, no tool, no session
 * projection and no host config; the client half registers the file viewer
 * with better-sidebar.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio
 */
import type { Context } from '@deepseek-ai/cordis';
/** Plugin identity for cordis.yml rows / loader diagnostics. */
export declare const name = "dsh-plugin-better-sidebar-plugin-audio";
/**
 * Services required before mounting: the webserver (the media route), the
 * session store (the authoritative cwd of the requesting session) and the web
 * runtime (`trustedHosts` for the fence).
 */
export declare const inject: string[];
/**
 * Mount the media route.
 * @param ctx - the host plugin context (services ready per {@link inject}).
 */
export declare function apply(ctx: Context): void;
