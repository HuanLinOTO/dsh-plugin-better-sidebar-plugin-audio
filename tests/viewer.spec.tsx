// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AudioSourceFacts } from '../src/client/source.ts'

/** Player double with a listener registry, shared with the module mock. */
const player = vi.hoisted(() => {
  const listeners = new Map<string, Set<() => void>>()
  const element = {
    duration: 12,
    currentTime: 0,
    paused: true,
    loop: false,
    playbackRate: 1,
    volume: 1,
    muted: false,
    addEventListener: (type: string, handler: () => void) => {
      const set = listeners.get(type) ?? new Set<() => void>()
      set.add(handler)
      listeners.set(type, set)
    },
    removeEventListener: (type: string, handler: () => void) => {
      listeners.get(type)?.delete(handler)
    },
    removeAttribute: () => {},
    load: () => {},
  }
  return {
    element,
    emit: (type: string) => {
      for (const handler of listeners.get(type) ?? []) handler()
    },
    play: vi.fn(async () => {}),
    pause: vi.fn(() => {}),
    dispose: vi.fn(() => {}),
    ensureContext: vi.fn(() => true),
    bins: vi.fn(() => null),
    analyser: null,
    contextState: 'idle',
  }
})

vi.mock('../src/client/player.ts', () => ({
  createPlayer: () => player,
}))

const { AudioViewer } = await import('../src/client/AudioViewer.tsx')

const source: AudioSourceFacts = {
  url: '/audio-preview/media?sessionId=s1&path=%2Fmusic%2Fclip.mp3',
  path: '/music/clip.mp3',
  name: 'clip.mp3',
  size: 4096,
  mime: 'audio/mpeg',
  sessionId: 's1',
}

beforeEach(() => {
  // jsdom has no canvas backend; the viewer must cope with a null context.
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext']
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('AudioViewer', () => {
  it('renders the transport, the file facts and a single-line read-out', () => {
    const { container } = render(<AudioViewer data={source} />)
    expect(screen.getByRole('toolbar')).toBeTruthy()
    expect(screen.getByText('clip.mp3')).toBeTruthy()
    expect(screen.getByText(/4\.0 KB/)).toBeTruthy()
    expect(container.querySelector('.dsh-audio__hint-readout')).toBeTruthy()
  })

  it('keeps every knob in the toolbar, with no manual decode button', () => {
    render(<AudioViewer data={source} />)
    expect(screen.queryByRole('button', { name: 'Decode waveform' })).toBeNull()
  })

  it('starts decoding on its own once the duration is known', async () => {
    render(<AudioViewer data={source} />)
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    expect(fetchMock).not.toHaveBeenCalled()
    player.emit('loadedmetadata')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/audio-preview/media?')
  })

  it('moves the interaction cheatsheet into the help button instead of the flow', () => {
    render(<AudioViewer data={source} />)
    const help = screen.getByRole('button', { name: 'Controls' })
    expect(help.getAttribute('title')).toMatch(/Space/)
  })

  it('keeps notices in a floating layer', () => {
    const { container } = render(<AudioViewer data={source} />)
    expect(container.querySelector('.dsh-audio__notices')).toBeTruthy()
    expect(container.querySelector('.dsh-audio__lane')).toBeTruthy()
  })

  it('publishes the visible window for diagnosis', () => {
    const { container } = render(<AudioViewer data={source} />)
    const lane = container.querySelector('.dsh-audio__lane') as HTMLElement
    expect(lane.getAttribute('data-view')).toMatch(/^-?\d+\.\d{3}--?\d+\.\d{3}$/)
  })

  it('renders the main lane with the playhead overlay and its own ruler', () => {
    const { container } = render(<AudioViewer data={source} />)
    // Data canvas + the pointer-transparent playhead/cursor overlay.
    expect(container.querySelectorAll('.dsh-audio__lane > canvas').length).toBe(2)
    expect(container.querySelector('.dsh-audio__lane-overlay')).toBeTruthy()
    expect(container.querySelectorAll('.dsh-audio__ruler canvas').length).toBe(1)
    expect(container.querySelectorAll('.dsh-audio__spectrum canvas').length).toBe(1)
  })

  it('plays and pauses through the engine', () => {
    render(<AudioViewer data={source} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(player.play).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(player.pause).toHaveBeenCalledTimes(1)
  })

  it('starts playback from the keyboard with Space', () => {
    const { container } = render(<AudioViewer data={source} />)
    const root = container.querySelector('[data-dsh-audio-preview="viewer"]') as HTMLElement
    fireEvent.keyDown(root, { key: ' ' })
    expect(player.play).toHaveBeenCalled()
  })

  it('switches to the spectrogram view and reports that it is computing', () => {
    render(<AudioViewer data={source} />)
    fireEvent.change(screen.getByLabelText('View'), { target: { value: 'spectrogram' } })
    expect(screen.getByText(/Computing spectrogram/)).toBeTruthy()
  })

  it('switches back to the waveform view', () => {
    render(<AudioViewer data={source} />)
    const view = screen.getByLabelText('View')
    fireEvent.change(view, { target: { value: 'spectrogram' } })
    fireEvent.change(view, { target: { value: 'waveform' } })
    expect(screen.queryByText(/Computing spectrogram/)).toBeNull()
  })

  it('hides the live spectrum lane when it is switched off', () => {
    const { container } = render(<AudioViewer data={source} />)
    fireEvent.change(screen.getByLabelText('Spectrum'), { target: { value: 'off' } })
    expect(container.querySelector('.dsh-audio__spectrum')).toBeNull()
  })

  it('offers the A-B loop only once a selection exists', () => {
    render(<AudioViewer data={source} />)
    const option = screen.getByRole('option', { name: 'Loop selection' }) as HTMLOptionElement
    expect(option.disabled).toBe(true)
  })

  it('reports a load failure instead of rendering a player', () => {
    render(<AudioViewer data={{ error: 'boom' }} />)
    expect(screen.getByText(/Cannot read this audio file/)).toBeTruthy()
    expect(screen.getByText(/boom/)).toBeTruthy()
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('surfaces a decode failure without breaking playback controls', async () => {
    render(<AudioViewer data={source} />)
    player.emit('loadedmetadata')
    expect(await screen.findByText(/Decode failed/)).toBeTruthy()
    expect(screen.getByRole('toolbar')).toBeTruthy()
  })

  it('disposes the engine on unmount', () => {
    const { unmount } = render(<AudioViewer data={source} />)
    unmount()
    expect(player.dispose).toHaveBeenCalledTimes(1)
  })
})
