import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Writable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  META_PATH,
  handleAudioRequest,
  resolveMediaPath,
  sessionCwdOf,
  statRequestedFile,
  type AudioRouteContext,
} from '../src/audio-route.ts'

/** Response double: records status/headers and collects the streamed body. */
class FakeResponse extends Writable {
  status = 0
  headers: Record<string, string> = {}
  headersSent = false
  destroyed = false
  chunks: Buffer[] = []

  writeHead(status: number, headers?: Record<string, string>): this {
    this.status = status
    this.headers = headers ?? {}
    this.headersSent = true
    return this
  }

  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(Buffer.from(chunk))
    callback()
  }

  body(): Buffer {
    return Buffer.concat(this.chunks)
  }
}

/** Request double: only the fields the route reads. */
function fakeRequest(url: string, options: { method?: string; headers?: Record<string, string> } = {}): IncomingMessage {
  const headers: Record<string, string> = { host: '127.0.0.1:3080', ...(options.headers ?? {}) }
  const request = {
    url,
    method: options.method ?? 'GET',
    headers,
    on: () => request,
    once: () => request,
  }
  return request as unknown as IncomingMessage
}

/** Context double with a session whose cwd is the fixture directory. */
function fakeContext(cwd: string | undefined, sessions: Map<string, { header?: { cwd?: string } }> = new Map()): AudioRouteContext {
  if (cwd !== undefined) sessions.set('s1', { header: { cwd } })
  return {
    sessions: { get: (id: string) => sessions.get(id) },
    webRuntime: { trustedHosts: [] },
  }
}

const query = (path: string, extra = ''): string =>
  'sessionId=s1&path=' + encodeURIComponent(path) + extra

/** Resolve once the response has flushed its streamed body. */
function flushed(response: FakeResponse): Promise<void> {
  if (response.writableEnded) return Promise.resolve()
  return new Promise<void>((resolve_) => response.once('finish', () => resolve_()))
}

let root = ''
let audioPath = ''

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-audio-route-'))
  audioPath = join(root, 'clip.mp3')
  await writeFile(audioPath, Buffer.from('0123456789', 'utf8'))
  await writeFile(join(root, 'notes.txt'), Buffer.from('nope', 'utf8'))
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('resolveMediaPath', () => {
  it('joins relative paths onto the base', () => {
    expect(resolveMediaPath('sub/clip.mp3', root)).toBe(join(root, 'sub', 'clip.mp3'))
  })

  it('keeps absolute paths as written', () => {
    expect(resolveMediaPath(audioPath, '/base')).toBe(audioPath)
  })

  it('rejects an empty path', () => {
    expect(() => resolveMediaPath('', '/base')).toThrowError(/path is required/)
  })
})

describe('sessionCwdOf', () => {
  it('prefers the session header cwd', () => {
    expect(sessionCwdOf({ get: () => ({ header: { cwd: '/from-session' } }) }, 's1', '/from-client')).toBe('/from-session')
  })

  it('falls back to the client cwd while the session is hydrating', () => {
    expect(sessionCwdOf({ get: () => undefined }, 's1', '/from-client')).toBe(resolve('/from-client'))
  })

  it('falls back to the process cwd as a last resort', () => {
    expect(sessionCwdOf(undefined, 's1', undefined)).toBe(process.cwd())
  })
})

describe('handleAudioRequest', () => {
  it('serves the metadata probe', async () => {
    const response = new FakeResponse()
    await handleAudioRequest(fakeRequest(META_PATH + '?' + query(audioPath)), response as unknown as ServerResponse, fakeContext(root))
    expect(response.status).toBe(200)
    const payload = JSON.parse(response.body().toString('utf8')) as { ok: boolean; value: { name: string; size: number; mime: string } }
    expect(payload.ok).toBe(true)
    expect(payload.value.name).toBe('clip.mp3')
    expect(payload.value.size).toBe(10)
    expect(payload.value.mime).toBe('audio/mpeg')
  })

  it('serves the whole file with Accept-Ranges', async () => {
    const response = new FakeResponse()
    const done = flushed(response)
    await handleAudioRequest(fakeRequest('/audio-preview/media?' + query(audioPath)), response as unknown as ServerResponse, fakeContext(root))
    await done
    expect(response.status).toBe(200)
    expect(response.headers['accept-ranges']).toBe('bytes')
    expect(response.headers['content-length']).toBe('10')
    expect(response.body().toString('utf8')).toBe('0123456789')
  })

  it('answers a range with 206 and the requested window', async () => {
    const response = new FakeResponse()
    const done = flushed(response)
    await handleAudioRequest(
      fakeRequest('/audio-preview/media?' + query(audioPath), { headers: { range: 'bytes=2-5' } }),
      response as unknown as ServerResponse,
      fakeContext(root),
    )
    await done
    expect(response.status).toBe(206)
    expect(response.headers['content-range']).toBe('bytes 2-5/10')
    expect(response.headers['content-length']).toBe('4')
    expect(response.body().toString('utf8')).toBe('2345')
  })

  it('answers an unsatisfiable range with 416', async () => {
    const response = new FakeResponse()
    await handleAudioRequest(
      fakeRequest('/audio-preview/media?' + query(audioPath), { headers: { range: 'bytes=99-' } }),
      response as unknown as ServerResponse,
      fakeContext(root),
    )
    expect(response.status).toBe(416)
    expect(response.headers['content-range']).toBe('bytes */10')
  })

  it('answers HEAD with headers only', async () => {
    const response = new FakeResponse()
    await handleAudioRequest(
      fakeRequest('/audio-preview/media?' + query(audioPath), { method: 'HEAD' }),
      response as unknown as ServerResponse,
      fakeContext(root),
    )
    expect(response.status).toBe(200)
    expect(response.headers['content-length']).toBe('10')
    expect(response.body().length).toBe(0)
  })

  it('resolves a relative path against the session cwd', async () => {
    const response = new FakeResponse()
    await handleAudioRequest(
      fakeRequest(META_PATH + '?' + query('clip.mp3')),
      response as unknown as ServerResponse,
      fakeContext(root),
    )
    expect(response.status).toBe(200)
  })

  it('refuses a non-audio file', async () => {
    const response = new FakeResponse()
    await handleAudioRequest(
      fakeRequest(META_PATH + '?' + query(join(root, 'notes.txt'))),
      response as unknown as ServerResponse,
      fakeContext(root),
    )
    expect(response.status).toBe(403)
    const payload = JSON.parse(response.body().toString('utf8')) as { error: { code: string } }
    expect(payload.error.code).toBe('unsupported-media')
  })

  it('answers 404 for a missing file and for an unknown route', async () => {
    const missing = new FakeResponse()
    await handleAudioRequest(
      fakeRequest(META_PATH + '?' + query(join(root, 'gone.mp3'))),
      missing as unknown as ServerResponse,
      fakeContext(root),
    )
    expect(missing.status).toBe(404)

    const unknown = new FakeResponse()
    await handleAudioRequest(
      fakeRequest('/audio-preview/other'),
      unknown as unknown as ServerResponse,
      fakeContext(root),
    )
    expect(unknown.status).toBe(404)
  })

  it('answers 400 when a parameter is missing', async () => {
    const response = new FakeResponse()
    await handleAudioRequest(
      fakeRequest(META_PATH + '?path=' + encodeURIComponent(audioPath)),
      response as unknown as ServerResponse,
      fakeContext(root),
    )
    expect(response.status).toBe(400)
  })

  it('answers 405 for a write method', async () => {
    const response = new FakeResponse()
    await handleAudioRequest(
      fakeRequest(META_PATH + '?' + query(audioPath), { method: 'POST' }),
      response as unknown as ServerResponse,
      fakeContext(root),
    )
    expect(response.status).toBe(405)
  })

  it('refuses a cross-site request before touching the file system', async () => {
    const response = new FakeResponse()
    await handleAudioRequest(
      fakeRequest(META_PATH + '?' + query(audioPath), {
        headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
      }),
      response as unknown as ServerResponse,
      fakeContext(root),
    )
    expect(response.status).toBe(403)
    const payload = JSON.parse(response.body().toString('utf8')) as { error: { code: string } }
    expect(payload.error.code).toBe('forbidden')
  })
})

describe('statRequestedFile', () => {
  it('rejects a directory that happens to carry an audio extension', async () => {
    const dirPath = join(root, 'folder.mp3')
    await mkdir(dirPath, { recursive: true })
    const url = new URL(META_PATH + '?' + query(dirPath), 'http://dsh.internal')
    await expect(statRequestedFile(url, fakeContext(root))).rejects.toThrowError(/not a regular file/)
  })

  it('rejects a path outside the audio vocabulary before touching the disk', async () => {
    const url = new URL(META_PATH + '?' + query(join(root, 'does-not-exist.zip')), 'http://dsh.internal')
    await expect(statRequestedFile(url, fakeContext(root))).rejects.toThrowError(/audio files only/)
  })
})
