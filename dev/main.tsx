/**
 * Visual harness for the viewer (development only, never shipped: the package
 * `files` whitelist excludes this directory).
 *
 * It renders the real component against a synthesized stereo WAV — a 440 Hz
 * tone, a sweep and a noise burst, so the waveform and the spectrogram both
 * have something to show — three times: on a dark skin, on a light one, and on
 * a skin shaped like the REAL host (only the tokens dsh web actually defines,
 * brand equal to label, no accent / hairline). The third panel is the sentinel
 * for "missing token" and "RMS indistinguishable from the waveform"; both are
 * invisible on the other two, which define every token.
 *
 * Both skins define their DSH tokens as var() chains on purpose. That is the
 * exact shape a canvas cannot resolve by itself, so if the waveform comes out
 * in the skin's brand colour the probe-based resolution works and the
 * "labels are unreadable" failure mode is genuinely gone.
 *
 * Build: pnpm run harness   (esbuild -> dev/bundle.js; open preview.html over a local
 * HTTP server — file:// never requests the script)
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AudioViewer } from '../src/client/AudioViewer.tsx'
import type { AudioSourceFacts } from '../src/client/source.ts'

/** Sample rate of the harness clip. */
const SAMPLE_RATE = 44100

/** Length of the harness clip in seconds. */
const SECONDS = 6

/**
 * Wrap raw PCM in a WAV container.
 * @param samples - interleaved 16-bit samples.
 * @param channels - channel count.
 * @param sampleRate - sample rate in hertz.
 * @returns the WAV file as a blob.
 */
function encodeWav(samples: Int16Array, channels: number, sampleRate: number): Blob {
  const bytesPerSample = 2
  const dataBytes = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)
  const writeText = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index++) view.setUint8(offset + index, text.charCodeAt(index))
  }
  writeText(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * bytesPerSample, true)
  view.setUint16(32, channels * bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, dataBytes, true)
  let offset = 44
  for (let index = 0; index < samples.length; index++) {
    view.setInt16(offset, samples[index] ?? 0, true)
    offset += 2
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

/**
 * Synthesize the harness clip.
 * @returns a WAV blob with a tone, a sweep and a noise tail.
 */
function synthesize(): Blob {
  const frames = SAMPLE_RATE * SECONDS
  const channels = 2
  const data = new Int16Array(frames * channels)
  for (let frame = 0; frame < frames; frame++) {
    const t = frame / SAMPLE_RATE
    let value = 0.35 * Math.sin(2 * Math.PI * 440 * t)
    if (t > 2 && t < 4) {
      const swept = 200 + (t - 2) * 1500
      value += 0.3 * Math.sin(2 * Math.PI * swept * (t - 2))
    }
    // A train of 4 ms clicks around t = 1 s: at whole-file resolution each
    // envelope column averages 1.5 ms so the train reads as a mild fuzz, but
    // once the window is zoomed enough for the envelope to be re-derived from
    // PCM the individual clicks stand out — the visual proof that waveform
    // zoom re-derives detail instead of magnifying the coarse envelope.
    if (t > 1 && t < 1.072) {
      const phase = (t - 1) % 0.012
      if (phase < 0.004) value += 0.9 * Math.sin(2 * Math.PI * 3000 * t)
    }
    if (t > 4.5) value += 0.18 * (Math.random() * 2 - 1)
    const envelope = Math.min(1, t * 3) * Math.min(1, (SECONDS - t) * 3)
    const left = Math.max(-1, Math.min(1, value * envelope))
    const right = Math.max(-1, Math.min(1, value * envelope * 0.65))
    data[frame * 2] = Math.round(left * 32767)
    data[frame * 2 + 1] = Math.round(right * 32767)
  }
  return encodeWav(data, channels, SAMPLE_RATE)
}

const blob = synthesize()
const url = URL.createObjectURL(blob)
const source: AudioSourceFacts = {
  url,
  path: '/tmp/harness-tone.wav',
  name: 'harness-tone.wav',
  size: blob.size,
  mime: 'audio/wav',
  sessionId: 'harness',
}

const root = document.getElementById('root')
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <div className="harness">
        <section className="panel skin-dark" data-skin="dark">
          <header>dark skin (brand token = magenta var chain)</header>
          <AudioViewer data={source} />
        </section>
        <section className="panel skin-light" data-skin="light">
          <header>light skin (brand token = green var chain)</header>
          <AudioViewer data={source} />
        </section>
        <section className="panel skin-host" data-skin="host">
          <header>real host skin (only the tokens dsh web defines — no accent, no hairline)</header>
          <AudioViewer data={source} />
        </section>
      </div>
    </StrictMode>,
  )
}
