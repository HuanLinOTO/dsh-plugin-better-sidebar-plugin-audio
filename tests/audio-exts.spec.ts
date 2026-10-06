import { describe, expect, it } from 'vitest'
import { AUDIO_EXTS, AUDIO_EXT_SET, contentTypeForAudio, isAudioPath } from '../src/audio-exts.ts'

describe('audio extension vocabulary', () => {
  it('covers the formats the host lists as unviewable binaries', () => {
    // ui-sidebar-documentpreview's unviewable.ts lists these eight; the viewer
    // is the only thing that can render them, so it must own them.
    for (const ext of ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'wma', 'opus']) {
      expect(AUDIO_EXT_SET.has(ext)).toBe(true)
    }
  })

  it('accepts an audio path regardless of case and rejects the rest', () => {
    expect(isAudioPath('/music/Track.MP3')).toBe(true)
    expect(isAudioPath('C:\\media\\clip.flac')).toBe(true)
    expect(isAudioPath('/tmp/notes.txt')).toBe(false)
    expect(isAudioPath('/tmp/no-extension')).toBe(false)
    expect(isAudioPath('/tmp/trailing.')).toBe(false)
    expect(isAudioPath('.mp3')).toBe(false)
  })

  it('never treats a non-audio file as audio through a directory name', () => {
    // The extension test reads the trailing segment only.
    expect(isAudioPath('/music.mp3/README.md')).toBe(false)
  })

  it('maps every advertised extension to an audio media type', () => {
    for (const ext of AUDIO_EXTS) {
      expect(contentTypeForAudio('x.' + ext)).toMatch(/^audio\//)
    }
    expect(contentTypeForAudio('/a/b.wav')).toBe('audio/wav')
    expect(contentTypeForAudio('/a/b.MP3')).toBe('audio/mpeg')
    expect(contentTypeForAudio('/a/b.zip')).toBe('application/octet-stream')
  })
})
