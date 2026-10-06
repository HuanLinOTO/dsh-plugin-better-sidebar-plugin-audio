// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FileViewerDescriptor } from 'dsh-better-sidebar/client/service'
import { AUDIO_EXTS } from '../src/audio-exts.ts'
import { VIEWER_ID, VIEWER_PRIORITY, apply } from '../src/client/index.tsx'
import type { AudioSourceFacts, ViewerData } from '../src/client/source.ts'

/** Registry + effect double for the sidebar service. */
function fakeHost() {
  const registered: FileViewerDescriptor[] = []
  const disposers: Array<() => void> = []
  const service = {
    registerFileViewer(descriptor: FileViewerDescriptor): () => void {
      registered.push(descriptor)
      const dispose = () => {
        const index = registered.indexOf(descriptor)
        if (index >= 0) registered.splice(index, 1)
      }
      disposers.push(dispose)
      return dispose
    },
  }
  const effects: Array<() => void> = []
  const ctx = {
    betterSidebar: service,
    effect(factory: () => unknown): void {
      const dispose = factory()
      if (typeof dispose === 'function') effects.push(dispose as () => void)
    },
  }
  return { ctx, registered, effects, disposers }
}

/** Stub fetch with the route's JSON envelope. */
function stubMeta(envelope: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(envelope), {
    status,
    headers: { 'content-type': 'application/json' },
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('client registration', () => {
  it('registers exactly one viewer for the audio vocabulary', () => {
    const host = fakeHost()
    apply(host.ctx as never)
    expect(host.registered).toHaveLength(1)
    const descriptor = host.registered[0]!
    expect(descriptor.id).toBe(VIEWER_ID)
    expect(descriptor.exts).toEqual(AUDIO_EXTS)
    expect(descriptor.fetchStrategy).toBe('custom')
    expect(typeof descriptor.load).toBe('function')
    expect(typeof descriptor.component).toBe('function')
  })

  it('outranks the built-in viewers so audio never falls into the code pane', () => {
    const host = fakeHost()
    apply(host.ctx as never)
    const priority = host.registered[0]!.priority ?? 0
    expect(priority).toBeGreaterThan(0)   // built-in markdown / html
    expect(priority).toBeGreaterThan(-100) // built-in code catch-all
    expect(VIEWER_PRIORITY).toBe(priority)
  })

  it('registers through ctx.effect so unload removes it again', () => {
    const host = fakeHost()
    apply(host.ctx as never)
    expect(host.effects).toHaveLength(1)
    host.effects[0]!()
    expect(host.registered).toHaveLength(0)
  })

  it('does nothing when the sidebar service is absent', () => {
    const ctx = { effect: () => {}, betterSidebar: undefined }
    expect(() => apply(ctx as never)).not.toThrow()
  })

  it('names itself for the settings list in the browser language', () => {
    const host = fakeHost()
    apply(host.ctx as never)
    const title = host.registered[0]!.title
    expect(typeof title === 'function' ? title() : title).toMatch(/audio|音频/i)
  })

  it('loads the file facts through the plugin route and hands back a media URL', async () => {
    const host = fakeHost()
    apply(host.ctx as never)
    const fetchMock = stubMeta({
      ok: true,
      value: { path: '/music/clip.mp3', name: 'clip.mp3', size: 2048, mime: 'audio/mpeg' },
    })
    const load = host.registered[0]!.load!
    const data = await load('/music/clip.mp3', { sessionId: 's1' } as never) as ViewerData
    expect((data as AudioSourceFacts).name).toBe('clip.mp3')
    expect((data as AudioSourceFacts).size).toBe(2048)
    expect((data as AudioSourceFacts).url).toContain('/audio-preview/media?')
    expect((data as AudioSourceFacts).url).toContain('path=%2Fmusic%2Fclip.mp3')
    expect((data as AudioSourceFacts).url).toContain('sessionId=s1')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/audio-preview/meta?')
  })

  it('reports a route failure instead of throwing into the editor host', async () => {
    const host = fakeHost()
    apply(host.ctx as never)
    stubMeta({ ok: false, error: { code: 'unsupported-media', message: 'audio files only' } }, 403)
    const data = await host.registered[0]!.load!('/music/x.zip', { sessionId: 's1' } as never) as ViewerData
    expect(data).toEqual({ error: 'audio files only' })
  })
})
