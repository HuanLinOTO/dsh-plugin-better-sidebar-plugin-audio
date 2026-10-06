/**
 * The audio viewer: a waveform player with a live spectrum and a whole-file
 * spectrogram.
 *
 * Playback streams through the host half's Range route on a plain audio
 * element (any size, native seeking, native rate/loop), and Web Audio is
 * attached only for the analyser and — on demand — for decoding the waveform
 * envelope and the spectrogram grid. The decoded PCM is dropped immediately,
 * so the viewer keeps a few hundred kilobytes no matter how long the file is.
 *
 * Layout: the main lane is the ONLY flexible row and its canvas is measured to
 * the lane's height (no dead strip under a fixed-height canvas), while the
 * toolbar / read-out / notices never change their box — notices float.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/AudioViewer
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { MAX_DECODE_SECONDS, decodeAudio, fetchBytes, type DecodedAudio } from './decode.ts'
import { drawSpectrogramFrame, drawSpectrum, drawTimeRuler, drawWaterfallFrame, drawWaveform } from './draw.ts'
import { labelsFor, pickLang } from './labels.ts'
import { computeChannelPeaks, mixChannelPeaks, type ChannelPeaks } from './peaks.ts'
import { createPlayer, type Player } from './player.ts'
import { abRange, normalizeSelection, selectionStats, type Selection } from './selection.ts'
import { computeSpectrogramWindow, renderSpectrogramRgba, type Spectrogram } from './spectrogram.ts'
import { collapseSpectrum, FFT_SIZE, frequencyAtX, peakFrequency, spectrumLayout, type SpectrumLayout } from './spectrum.ts'
import { isSourceError, type ViewerData } from './source.ts'
import { ensureViewerStyles } from './styles.ts'
import { readPalette, type CanvasPalette } from './theme.ts'
import { clampView, formatHz, formatTime, fullView, timeAtX, xAtTime, zoomView, type WaveView } from './view.ts'
import { WaterfallBuffer } from './waterfall.ts'

/** Time-ruler strip height in CSS pixels (must match the stylesheet). */
const RULER_HEIGHT = 18

/** Live-spectrum lane height in CSS pixels. */
const SPECTRUM_HEIGHT = 128

/** Smallest main-lane height we will paint into. */
const MIN_LANE_HEIGHT = 90

/** Playhead stroke width in CSS pixels. */
const PLAYHEAD_WIDTH = 2

/**
 * Windows up to this many samples re-derive their envelope synchronously in
 * the render (~45 s at 44.1 kHz); anything bigger debounces instead.
 */
const SYNC_ENVELOPE_SAMPLES = 2_000_000

/** Playback rates offered in the toolbar. */
const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3]

/** What the main lane shows. */
type MainView = 'waveform' | 'spectrogram'

/** Which spectrum rendering is active. */
type SpectrumStyle = 'bars' | 'line' | 'waterfall' | 'off'

/** Loop behaviour. */
type LoopMode = 'off' | 'all' | 'ab'

/** Which channel the waveform shows. */
type ChannelKey = 'mix' | number

/** Decoding progress. */
interface DecodeState {
  status: 'idle' | 'running' | 'done' | 'failed'
  loaded: number
  total: number
  error?: string | undefined
}

/** One in-flight pointer gesture on the main lane. */
interface DragState {
  mode: 'seek' | 'select' | 'pan'
  startX: number
  startTime: number
  startView: WaveView
}

/** Props handed over by the sidebar's editor host. */
export interface AudioViewerProps {
  /** Source facts from load(), or the failure to display. */
  data: ViewerData
}

/**
 * Clamp a number.
 * @param value - candidate.
 * @param min - lower bound.
 * @param max - upper bound.
 * @returns the clamped value.
 */
function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

/**
 * Human-readable byte size.
 * @param bytes - size in bytes.
 * @returns e.g. "3.4 MB".
 */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const shown = value >= 10 || unit === 0 ? String(Math.round(value)) : value.toFixed(1)
  return shown + ' ' + (units[unit] ?? 'B')
}

/** Device pixel ratio of the current window. */
function devicePixelRatioOf(): number {
  return typeof window === 'undefined' ? 1 : (window.devicePixelRatio || 1)
}

/**
 * Size a canvas for a CSS box and return a context scaled to match.
 * @param canvas - the canvas (may be null before mount).
 * @param cssWidth - CSS width in pixels.
 * @param cssHeight - CSS height in pixels.
 * @param scale - device pixel ratio (clamped to 1..2).
 * @returns the scaled 2D context, or null when unavailable (jsdom).
 */
function prepareCanvas(
  canvas: HTMLCanvasElement | null,
  cssWidth: number,
  cssHeight: number,
  scale: number,
): CanvasRenderingContext2D | null {
  if (canvas === null) return null
  const ratio = Math.min(Math.max(scale, 1), 2)
  const pixelWidth = Math.max(1, Math.floor(cssWidth * ratio))
  const pixelHeight = Math.max(1, Math.floor(cssHeight * ratio))
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight
  const context = canvas.getContext('2d')
  if (context === null) return null
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  return context
}

/**
 * Render the audio viewer.
 * @param props - the loaded source facts.
 * @returns the player pane, or the failure panel.
 */
export function AudioViewer({ data }: AudioViewerProps): ReactNode {
  const lang = useMemo(() => pickLang(typeof navigator === 'undefined' ? undefined : navigator.languages), [])
  const t = useMemo(() => labelsFor(lang), [lang])
  const failed = isSourceError(data)
  const source = failed ? null : data
  const sourceUrl = source === null ? null : source.url
  const sourceSize = source === null ? 0 : source.size

  const containerRef = useRef<HTMLDivElement | null>(null)
  const laneRef = useRef<HTMLDivElement | null>(null)
  const laneCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const rulerCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const spectrumCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const playerRef = useRef<Player | null>(null)
  const waterfallRef = useRef<WaterfallBuffer | null>(null)
  const frameRef = useRef<ImageData | null>(null)
  const layoutRef = useRef<SpectrumLayout | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const decodeAbortRef = useRef<AbortController | null>(null)
  const decodeStartedRef = useRef(false)
  const lastTimeRef = useRef(0)
  const lastPeakRef = useRef(0)
  const frameSkipRef = useRef(0)
  const hasSpectrumRef = useRef(false)

  const [palette, setPalette] = useState<CanvasPalette>(() => readPalette())
  const [canvasBox, setCanvasBox] = useState({ width: 600, height: 200 })
  const [mainView, setMainView] = useState<MainView>('waveform')
  const [heatmap, setHeatmap] = useState<{ image: HTMLCanvasElement | null; spec: Spectrogram | null }>({
    image: null,
    spec: null,
  })
  /** Envelope re-derived from PCM for the current window (zoom detail). */
  const [waveWindow, setWaveWindow] = useState<{ peaks: ChannelPeaks; start: number; end: number } | null>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [rate, setRate] = useState(1)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [loopMode, setLoopMode] = useState<LoopMode>('off')
  const [channel, setChannel] = useState<ChannelKey>('mix')
  const [spectrumStyle, setSpectrumStyle] = useState<SpectrumStyle>('bars')
  const [showRms, setShowRms] = useState(true)
  const [decoded, setDecoded] = useState<DecodedAudio | null>(null)
  const [decodeState, setDecodeState] = useState<DecodeState>({ status: 'idle', loaded: 0, total: 0 })
  const [view, setView] = useState<WaveView>(() => fullView(0))
  const [selection, setSelection] = useState<Selection | null>(null)
  const [cursor, setCursor] = useState<number | null>(null)
  /** Latest hover time for the overlay loop (a ref: the loop must not restart on every pointer move). */
  const cursorRef = useRef<number | null>(null)
  const [cursorHz, setCursorHz] = useState<number | null>(null)
  const [peakHz, setPeakHz] = useState<number | null>(null)
  const [spectrumLive, setSpectrumLive] = useState(false)
  const [audioFailure, setAudioFailure] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const envelope = useMemo<{ mix: ChannelPeaks | null; per: ChannelPeaks[] }>(() => {
    if (decoded === null) return { mix: null, per: [] }
    return { mix: mixChannelPeaks(decoded.peaks), per: decoded.peaks }
  }, [decoded])

  const activePeaks = channel === 'mix' ? envelope.mix : (envelope.per[channel] ?? envelope.mix)
  const effectiveView = useMemo(
    () => (duration > 0 ? clampView(view, duration) : view),
    [duration, view],
  )
  const loopWindow = abRange(selection)

  useEffect(() => {
    ensureViewerStyles()
  }, [])

  // Skin changes (the host swaps a class / data attribute on the root) must be
  // picked up, otherwise the canvases keep the previous theme's colours.
  // The skin is read from the viewer's own container (a skin can be scoped to
  // any ancestor), and re-read whenever the host flips a theme attribute.
  useEffect(() => {
    setPalette(readPalette(containerRef.current))
    if (typeof MutationObserver === 'undefined') return
    const root = document.documentElement
    if (root === null) return
    const observer = new MutationObserver(() => setPalette(readPalette(containerRef.current)))
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-skin'] })
    return () => observer.disconnect()
  }, [])

  // Engine ------------------------------------------------------------------
  useEffect(() => {
    if (sourceUrl === null) return
    decodeStartedRef.current = false
    const player = createPlayer(sourceUrl)
    playerRef.current = player
    const element = player.element
    const onMetadata = () => {
      const value = Number.isFinite(element.duration) ? element.duration : 0
      if (value > 0) {
        setDuration(value)
        setView(current => (current.end <= 0 || current.end > value ? fullView(value) : current))
      }
      setReady(true)
    }
    const onTimeUpdate = () => {
      const current = element.currentTime
      lastTimeRef.current = current
      setTime(current)
    }
    const onPlay = () => {
      setPlaying(true)
      player.ensureContext()
      if (player.contextState === 'failed') setAudioFailure(true)
    }
    const onPause = () => setPlaying(false)
    const onEnded = () => setPlaying(false)
    const onError = () => setNotice(t.loadFailed)
    element.addEventListener('loadedmetadata', onMetadata)
    element.addEventListener('durationchange', onMetadata)
    element.addEventListener('timeupdate', onTimeUpdate)
    element.addEventListener('play', onPlay)
    element.addEventListener('pause', onPause)
    element.addEventListener('ended', onEnded)
    element.addEventListener('error', onError)
    return () => {
      element.removeEventListener('loadedmetadata', onMetadata)
      element.removeEventListener('durationchange', onMetadata)
      element.removeEventListener('timeupdate', onTimeUpdate)
      element.removeEventListener('play', onPlay)
      element.removeEventListener('pause', onPause)
      element.removeEventListener('ended', onEnded)
      element.removeEventListener('error', onError)
      player.dispose()
      playerRef.current = null
      setPlaying(false)
      setReady(false)
      setWaveWindow(null)
    }
  }, [sourceUrl, t.loadFailed])

  useEffect(() => {
    const player = playerRef.current
    if (player === null) return
    player.element.loop = loopMode === 'all'
    player.element.playbackRate = rate
    player.element.volume = volume
    player.element.muted = muted
  }, [loopMode, muted, rate, ready, volume])

  // Decoding ----------------------------------------------------------------
  const runDecode = useCallback(async (): Promise<void> => {
    if (sourceUrl === null) return
    decodeAbortRef.current?.abort()
    const controller = new AbortController()
    decodeAbortRef.current = controller
    setDecodeState({ status: 'running', loaded: 0, total: sourceSize })
    try {
      const bytes = await fetchBytes(sourceUrl, {
        signal: controller.signal,
        onProgress: (loaded, total) => setDecodeState(previous => (
          previous.status === 'running'
            ? { status: 'running', loaded, total: total > 0 ? total : previous.total }
            : previous
        )),
      })
      const result = await decodeAudio(bytes)
      if (controller.signal.aborted) return
      setDecoded(result)
      setDecodeState({ status: 'done', loaded: 0, total: 0 })
      setDuration(previous => (previous > 0 ? previous : result.duration))
      setView(fullView(result.duration))
      setChannel(current => (current === 'mix' || current < result.channels ? current : 'mix'))
    } catch (error) {
      if (controller.signal.aborted) return
      setDecodeState({
        status: 'failed',
        loaded: 0,
        total: 0,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }, [sourceSize, sourceUrl])

  // Decoding is automatic — opening a file is already the intent to look at
  // it. Only absurdly long recordings are skipped, and that is reported instead
  // of asking the user to press a button.
  useEffect(() => {
    if (sourceUrl === null) return
    if (duration <= 0 || decodeStartedRef.current) return
    decodeStartedRef.current = true
    if (duration > MAX_DECODE_SECONDS) {
      setNotice(t.tooLong)
      return
    }
    void runDecode()
    return () => {
      decodeAbortRef.current?.abort()
    }
  }, [duration, runDecode, sourceUrl, t.tooLong])

  // Layout ------------------------------------------------------------------
  // The canvas paints at exactly the box it occupies: it is absolutely
  // positioned inside the lane (CSS owns the layout), so measuring it can never
  // feed back into the layout.
  useEffect(() => {
    const canvas = laneCanvasRef.current
    if (canvas === null) return
    const measure = () => setCanvasBox({
      width: Math.max(120, Math.floor(canvas.clientWidth || 0)),
      height: Math.max(MIN_LANE_HEIGHT, Math.floor(canvas.clientHeight || 0)),
    })
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [mainView])

  // The heat map is derived from the WINDOW ON SCREEN, not from the whole
  // file: zooming in then re-derives the same column count from fewer seconds,
  // so detail grows with the zoom instead of magnifying a few coarse cells.
  // Debounced, because a drag would otherwise queue one STFT per frame.
  useEffect(() => {
    const mono = decoded?.mono
    const sampleRate = decoded?.sampleRate ?? 0
    if (mainView !== 'spectrogram' || mono === undefined || mono.length === 0 || sampleRate <= 0) return
    const ratio = Math.min(2, Math.max(1, devicePixelRatioOf()))
    const columns = Math.max(64, Math.round(canvasBox.width * ratio))
    const bands = Math.max(128, Math.min(512, Math.round(canvasBox.height * ratio)))
    const timer = setTimeout(() => {
      const spec = computeSpectrogramWindow(mono, sampleRate, {
        startTime: effectiveView.start,
        endTime: effectiveView.end,
        columns,
        bands,
        scale: 'mel',
      })
      const canvas = document.createElement('canvas')
      canvas.width = spec.columns
      canvas.height = spec.bands
      const context = canvas.getContext('2d')
      if (context === null) return
      const frame = context.createImageData(spec.columns, spec.bands)
      renderSpectrogramRgba(spec, frame.data, palette.variant)
      context.putImageData(frame, 0, 0)
      setHeatmap({ image: canvas, spec })
    }, 120)
    return () => clearTimeout(timer)
  }, [canvasBox.height, canvasBox.width, decoded, effectiveView, mainView, palette.variant])

  // The waveform gets the same treatment as the heat map: while the whole-file
  // envelope still has more columns in the window than the lane has pixels it
  // is merely cropped (cheap), but once the window is narrow enough that
  // cropping would lose detail, the envelope is re-derived from the downmixed
  // PCM at the lane's own resolution — so zooming in actually reveals detail.
  // Only the mix envelope can be re-derived (per-channel PCM is not kept), so
  // single-channel views fall back to the cropped whole-file envelope.
  //
  // The re-derivation is SYNCHRONOUS while the window covers at most
  // SYNC_ENVELOPE_SAMPLES samples (~45 s): a zoomed view then gets its finer
  // envelope in the same render, with no debounce and no visible switch
  // between a coarse and a fine envelope. Longer windows (a deep zoom into a
  // very long recording) re-derive on a debounce instead, keeping the UI
  // responsive while dragging.
  const syncWindowPeaks = useMemo<ChannelPeaks | null>(() => {
    const mono = decoded?.mono
    const sampleRate = decoded?.sampleRate ?? 0
    if (
      channel !== 'mix' || decoded === null || decoded.duration <= 0
      || mono === undefined || mono.length === 0 || sampleRate <= 0
    ) return null
    const total = Math.max(decoded.duration, duration)
    const span = effectiveView.end - effectiveView.start
    if (span >= total - 1e-6) return null
    const ratio = Math.min(2, Math.max(1, devicePixelRatioOf()))
    const targetColumns = Math.max(200, Math.round(canvasBox.width * ratio))
    const available = decoded.columns * (span / decoded.duration)
    if (available >= targetColumns - 2) return null
    if (span * sampleRate > SYNC_ENVELOPE_SAMPLES) return null
    const from = Math.max(0, Math.floor(effectiveView.start * sampleRate))
    const to = Math.min(mono.length, Math.ceil(effectiveView.end * sampleRate))
    if (to - from < 2) return null
    return computeChannelPeaks(mono.subarray(from, to), targetColumns)
  }, [canvasBox.width, channel, decoded, duration, effectiveView])

  // Debounced fallback for windows too big to re-derive in a render: the
  // previous result is kept (and simply stops matching) until the new one is
  // ready, so a zoom never flashes a coarse envelope mid-gesture.
  useEffect(() => {
    if (syncWindowPeaks !== null || decoded === null || decoded.duration <= 0) {
      return
    }
    const mono = decoded.mono
    const sampleRate = decoded.sampleRate
    if (mono === undefined || mono.length === 0 || sampleRate <= 0 || channel !== 'mix') return
    const total = Math.max(decoded.duration, duration)
    const span = effectiveView.end - effectiveView.start
    if (span >= total - 1e-6) return
    const ratio = Math.min(2, Math.max(1, devicePixelRatioOf()))
    const targetColumns = Math.max(200, Math.round(canvasBox.width * ratio))
    const available = decoded.columns * (span / decoded.duration)
    if (available >= targetColumns - 2) return
    if (span * sampleRate <= SYNC_ENVELOPE_SAMPLES) return
    const timer = setTimeout(() => {
      const from = Math.max(0, Math.floor(effectiveView.start * sampleRate))
      const to = Math.min(mono.length, Math.ceil(effectiveView.end * sampleRate))
      if (to - from < 2) return
      setWaveWindow({
        peaks: computeChannelPeaks(mono.subarray(from, to), targetColumns),
        start: effectiveView.start,
        end: effectiveView.end,
      })
    }, 120)
    return () => clearTimeout(timer)
  }, [canvasBox.width, channel, decoded, duration, effectiveView, syncWindowPeaks])

  // Main lane ---------------------------------------------------------------
  useEffect(() => {
    const { width, height } = canvasBox
    const context = prepareCanvas(laneCanvasRef.current, width, height, devicePixelRatioOf())
    if (context === null) return
    if (mainView === 'spectrogram') {
      const spec = heatmap.spec
      drawSpectrogramFrame(context, {
        width,
        height,
        image: spec === null ? null : heatmap.image,
        spec: spec === null
          ? { columns: 0, bands: 0, startTime: 0, endTime: 0, minHz: 0, maxHz: 0, scale: 'mel' }
          : {
            columns: spec.columns,
            bands: spec.bands,
            startTime: spec.startTime,
            endTime: spec.endTime,
            minHz: spec.minHz,
            maxHz: spec.maxHz,
            scale: spec.scale,
          },
        view: effectiveView,
        playhead: null,
        selection,
        colors: palette,
      })
      return
    }
    // The window envelope matches exactly when the view it was derived for is
    // still on screen; otherwise (or for single-channel views) the whole-file
    // envelope is cropped to the window by the painter.
    const matchedWindow = waveWindow !== null
      && waveWindow.start === effectiveView.start
      && waveWindow.end === effectiveView.end
      ? waveWindow
      : null
    const windowPeaks = syncWindowPeaks !== null
      ? { peaks: syncWindowPeaks, start: effectiveView.start, end: effectiveView.end }
      : matchedWindow
    const paintPeaks = windowPeaks !== null ? windowPeaks.peaks : activePeaks
    if (paintPeaks === null) {
      context.clearRect(0, 0, width, height)
      return
    }
    drawWaveform(context, {
      width,
      height,
      view: effectiveView,
      duration: windowPeaks !== null ? windowPeaks.end - windowPeaks.start : (decoded?.duration ?? 0),
      peaksStart: windowPeaks !== null ? windowPeaks.start : 0,
      peaks: paintPeaks,
      showRms,
      playhead: null,
      selection,
      colors: palette,
    })
  }, [
    activePeaks,
    decoded,
    duration,
    effectiveView,
    mainView,
    palette,
    selection,
    canvasBox,
    heatmap,
    showRms,
    waveWindow,
    syncWindowPeaks,
  ])

  useEffect(() => {
    const context = prepareCanvas(rulerCanvasRef.current, canvasBox.width, RULER_HEIGHT, devicePixelRatioOf())
    if (context === null) return
    drawTimeRuler(context, { width: canvasBox.width, height: RULER_HEIGHT, view: effectiveView, colors: palette })
  }, [canvasBox.width, palette, effectiveView])

  // Playhead + hover-cursor overlay ---------------------------------------
  // A separate canvas animated by requestAnimationFrame and fed straight
  // from the media element's currentTime. The timeupdate event is too coarse
  // (and stops firing in background tabs), and re-painting the whole waveform
  // layer per tick would be wasteful; a dedicated 2px line at display rate
  // stays smooth through play, seek, pause and end in either view, without
  // the data layers ever needing to repaint for the playhead's sake.
  useEffect(() => {
    cursorRef.current = cursor
  }, [cursor])

  useEffect(() => {
    if (typeof requestAnimationFrame !== 'function') return
    let frame = 0
    let stopped = false
    const draw = (): void => {
      if (stopped) return
      frame = requestAnimationFrame(draw)
      const { width, height } = canvasBox
      if (width <= 0 || height <= 0) return
      // The same device-pixel treatment as the data layer, so the line stays as
      // crisp as the waveform it marks on a HiDPI screen.
      const g = prepareCanvas(overlayCanvasRef.current, width, height, devicePixelRatioOf())
      if (g === null) return
      g.clearRect(0, 0, width, height)
      const player = playerRef.current
      if (player !== null && duration > 0) {
        const current = player.element.currentTime
        if (Number.isFinite(current)) {
          // Clamped to the lane: a playhead outside a zoomed-in window parks
          // against the edge it left through instead of vanishing off-canvas.
          const x = clamp(
            Math.round(xAtTime(effectiveView, current, width)),
            0,
            Math.max(0, width - PLAYHEAD_WIDTH),
          )
          g.fillStyle = palette.playhead
          g.fillRect(x, 0, PLAYHEAD_WIDTH, height)
        }
      }
      const hover = cursorRef.current
      if (hover !== null) {
        g.strokeStyle = palette.axis
        g.lineWidth = 1
        const x = clamp(Math.round(xAtTime(effectiveView, hover, width)), 0, Math.max(0, width - 1)) + 0.5
        g.beginPath()
        g.moveTo(x, 0)
        g.lineTo(x, height)
        g.stroke()
      }
    }
    frame = requestAnimationFrame(draw)
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
    }
  }, [canvasBox, duration, effectiveView, palette])

  // Live spectrum -----------------------------------------------------------
  const paintSpectrum = useCallback((player: Player): void => {
    const canvas = spectrumCanvasRef.current
    if (canvas === null) return
    const columns = Math.max(1, Math.floor(canvas.clientWidth || canvasBox.width))
    const rows = Math.max(40, Math.floor(canvas.clientHeight || SPECTRUM_HEIGHT))
    if (canvas.width !== columns || canvas.height !== rows) {
      canvas.width = columns
      canvas.height = rows
      layoutRef.current = null
      waterfallRef.current = null
      frameRef.current = null
    }
    const context = canvas.getContext('2d')
    if (context === null) return
    const bins = player.bins()
    const analyser = player.analyser
    if (bins === null || analyser === null) {
      if (player.contextState === 'failed') setAudioFailure(true)
      return
    }
    const sampleRate = analyser.context.sampleRate
    let layout = layoutRef.current
    if (layout === null || layout.sampleRate !== sampleRate || layout.columns !== columns) {
      layout = spectrumLayout(columns, sampleRate, { fftSize: FFT_SIZE })
      layoutRef.current = layout
    }
    const values = collapseSpectrum(bins, layout)
    if (!hasSpectrumRef.current) {
      for (let index = 0; index < values.length; index++) {
        if ((values[index] ?? 0) > 0.01) { hasSpectrumRef.current = true; setSpectrumLive(true); break }
      }
    }
    const now = typeof performance === 'undefined' ? Date.now() : performance.now()
    if (now - lastPeakRef.current > 250) {
      lastPeakRef.current = now
      const hz = peakFrequency(bins, sampleRate, FFT_SIZE)
      setPeakHz(hz > 0 ? hz : null)
    }
    if (spectrumStyle === 'waterfall') {
      let buffer = waterfallRef.current
      if (buffer === null || buffer.width !== columns) {
        buffer = new WaterfallBuffer(columns, rows)
        waterfallRef.current = buffer
        frameRef.current = null
      }
      buffer.push(values)
      let frame = frameRef.current
      if (frame === null || frame.width !== columns) {
        frame = context.createImageData(columns, rows)
        frameRef.current = frame
      }
      buffer.render(frame.data, palette.variant)
      drawWaterfallFrame(context, frame)
      return
    }
    drawSpectrum(context, {
      width: columns,
      height: rows,
      values,
      style: spectrumStyle === 'line' ? 'line' : 'bars',
      layout,
      peakHz,
      cursorHz,
      colors: palette,
    })
  }, [canvasBox.width, cursorHz, palette, peakHz, spectrumStyle])

  useEffect(() => {
    if (sourceUrl === null) return
    if (spectrumStyle === 'off') return
    if (typeof requestAnimationFrame !== 'function') return
    let frame = 0
    let stopped = false
    const tick = () => {
      if (stopped) return
      frame = requestAnimationFrame(tick)
      const player = playerRef.current
      if (player === null) return
      const element = player.element
      const current = element.currentTime
      if (Math.abs(current - lastTimeRef.current) > 0.04) {
        lastTimeRef.current = current
        setTime(current)
      }
      if (loopMode === 'ab' && loopWindow !== null && !element.paused && current >= loopWindow.end - 0.02) {
        element.currentTime = loopWindow.start
        lastTimeRef.current = loopWindow.start
        setTime(loopWindow.start)
      }
      frameSkipRef.current = (frameSkipRef.current + 1) % (element.paused ? 8 : 1)
      if (frameSkipRef.current !== 0) return
      paintSpectrum(player)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
    }
  }, [loopMode, loopWindow, paintSpectrum, sourceUrl, spectrumStyle])

  // Interaction -------------------------------------------------------------
  const seekTo = useCallback((seconds: number): void => {
    const player = playerRef.current
    if (player === null) return
    const total = duration > 0 ? duration : player.element.duration
    const target = clamp(seconds, 0, Number.isFinite(total) ? total : seconds)
    try {
      player.element.currentTime = target
    } catch {
      // A media element without metadata refuses the write; the next tick retries.
    }
    lastTimeRef.current = target
    setTime(target)
  }, [duration])

  const togglePlay = useCallback((): void => {
    const player = playerRef.current
    if (player === null) return
    if (player.element.paused) {
      void player.play().catch((error: unknown) => {
        setNotice(error instanceof Error ? error.message : String(error))
      })
    } else {
      player.pause()
    }
  }, [])

  const stop = useCallback((): void => {
    playerRef.current?.pause()
    seekTo(0)
  }, [seekTo])

  const zoomBy = useCallback((factor: number): void => {
    setView(current => {
      const bounds = duration > 0 ? duration : current.end
      return zoomView(clampView(current, bounds), time, factor, bounds)
    })
  }, [duration, time])

  const fit = useCallback((): void => setView(fullView(duration)), [duration])

  const pointerTime = useCallback((clientX: number): number => {
    const area = laneRef.current
    if (area === null) return 0
    const rect = area.getBoundingClientRect()
    const upper = duration > 0 ? duration : Number.MAX_SAFE_INTEGER
    return clamp(timeAtX(effectiveView, clientX - rect.left, canvasBox.width), 0, upper)
  }, [canvasBox.width, duration, effectiveView])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    // Keep the browser from starting a text selection / native drag while the
    // pointer is scrubbing.
    event.preventDefault()
    const at = pointerTime(event.clientX)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Capture is a nicety; dragging still works without it.
    }
    if (event.altKey || event.button === 1) {
      dragRef.current = { mode: 'pan', startX: event.clientX, startTime: at, startView: effectiveView }
      return
    }
    if (event.shiftKey) {
      dragRef.current = { mode: 'select', startX: event.clientX, startTime: at, startView: effectiveView }
      setSelection({ start: at, end: at })
      return
    }
    dragRef.current = { mode: 'seek', startX: event.clientX, startTime: at, startView: effectiveView }
    seekTo(at)
  }, [effectiveView, pointerTime, seekTo])

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    const at = pointerTime(event.clientX)
    setCursor(at)
    const drag = dragRef.current
    if (drag === null) return
    if (drag.mode === 'seek') {
      seekTo(at)
      return
    }
    if (drag.mode === 'select') {
      setSelection(normalizeSelection(drag.startTime, at))
      return
    }
    const span = drag.startView.end - drag.startView.start
    const delta = ((event.clientX - drag.startX) / Math.max(1, canvasBox.width)) * span
    setView(clampView({ start: drag.startView.start - delta, end: drag.startView.end - delta }, duration > 0 ? duration : span))
  }, [canvasBox.width, duration, pointerTime, seekTo])

  const onPointerUp = useCallback((): void => {
    dragRef.current = null
  }, [])

  const onDoubleClick = useCallback((): void => {
    setView(fullView(duration))
  }, [duration])

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 1 : 5
    switch (event.key) {
      case ' ':
      case 'Spacebar':
        event.preventDefault()
        togglePlay()
        return
      case 'ArrowLeft':
        event.preventDefault()
        seekTo(time - step)
        return
      case 'ArrowRight':
        event.preventDefault()
        seekTo(time + step)
        return
      case 'Home':
        event.preventDefault()
        seekTo(0)
        return
      case 'End':
        event.preventDefault()
        seekTo(duration)
        return
      case '+':
      case '=':
        event.preventDefault()
        zoomBy(0.8)
        return
      case '-':
      case '_':
        event.preventDefault()
        zoomBy(1.25)
        return
      case 'm':
      case 'M':
        setMuted(current => !current)
        return
      case 'l':
      case 'L':
        setLoopMode(current => (current === 'off' ? 'all' : current === 'all' ? 'ab' : 'off'))
        return
      default:
        return
    }
  }, [duration, seekTo, time, togglePlay, zoomBy])

  useEffect(() => {
    const element = laneRef.current
    if (element === null) return
    const onWheel = (event: WheelEvent): void => {
      if (event.deltaY === 0) return
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const focus = clamp(timeAtX(effectiveView, event.clientX - rect.left, canvasBox.width), 0, duration > 0 ? duration : 0)
      const factor = event.deltaY > 0 ? 1.25 : 0.8
      setView(current => {
        const bounds = duration > 0 ? duration : current.end
        return zoomView(clampView(current, bounds), focus, factor, bounds)
      })
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [canvasBox.width, duration, effectiveView])

  // Read-outs ---------------------------------------------------------------
  const stats = useMemo(() => {
    if (selection === null || decoded === null || activePeaks === null) return null
    const list = channel === 'mix' ? envelope.per : [activePeaks]
    return selectionStats(list, selection, effectiveView, canvasBox.width, decoded.columns)
  }, [activePeaks, canvasBox.width, channel, decoded, effectiveView, envelope.per, selection])

  const decodeProgress = decodeState.status === 'running' && decodeState.total > 0
    ? Math.round((decodeState.loaded / decodeState.total) * 100)
    : null

  const readout = useMemo(() => {
    const parts: string[] = []
    parts.push(t.cursor + ' ' + (cursor === null ? '—' : formatTime(cursor, true)))
    if (cursorHz !== null) parts.push(formatHz(cursorHz))
    if (peakHz !== null) parts.push(t.peakFreq + ' ' + formatHz(peakHz))
    if (stats !== null) {
      parts.push(t.selection + ' ' + formatTime(stats.duration, true)
        + ' · ' + t.peak + ' ' + stats.peakDb.toFixed(1) + ' dB'
        + ' · ' + t.rmsReadout + ' ' + stats.rmsDb.toFixed(1) + ' dB')
    }
    if (ready === false) parts.unshift(t.loading)
    return parts.join(' · ')
  }, [cursor, cursorHz, peakHz, ready, stats, t])

  if (failed) {
    return (
      <div className="dsh-audio" data-dsh-audio-preview="error">
        <div className="dsh-audio__error">{t.loadFailed + ': ' + data.error}</div>
      </div>
    )
  }


  return (
    <div
      className="dsh-audio"
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-dsh-audio-preview="viewer"
    >
      <div className="dsh-audio__title">
        <span className="dsh-audio__name" title={source?.path ?? ''}>{source?.name ?? ''}</span>
        <span className="dsh-audio__meta">
          {formatBytes(sourceSize)
            + (decoded === null
              ? ''
              : ' · ' + (decoded.sampleRate / 1000).toFixed(1) + ' kHz · '
                + (decoded.channels === 1 ? 'mono' : String(decoded.channels) + ' ch'))}
        </span>
      </div>

      <div className="dsh-audio__bar" role="toolbar" aria-label={t.waveform}>
        <span className="dsh-audio__group">
          <button type="button" onClick={togglePlay} aria-label={playing ? t.pause : t.play} title={playing ? t.pause : t.play}>
            {playing ? '❙❙' : '▶'}
          </button>
          <button type="button" onClick={stop} aria-label={t.stop} title={t.stop}>■</button>
          <button type="button" onClick={() => seekTo(0)} aria-label={t.replay} title={t.replay}>⏮</button>
        </span>
        <span className="dsh-audio__time">
          {formatTime(time, true) + ' / ' + formatTime(duration)}
        </span>
        <span className="dsh-audio__group">
          <span className="dsh-audio__label">{t.view}</span>
          <select aria-label={t.view} value={mainView} onChange={(event) => setMainView(event.target.value as MainView)}>
            <option value="waveform">{t.viewWaveform}</option>
            <option value="spectrogram">{t.viewSpectrogram}</option>
          </select>
        </span>
        <span className="dsh-audio__group">
          <span className="dsh-audio__label">{t.rate}</span>
          <select aria-label={t.rate} value={String(rate)} onChange={(event) => setRate(Number(event.target.value))}>
            {RATES.map(value => <option key={value} value={String(value)}>{String(value) + '×'}</option>)}
          </select>
        </span>
        <span className="dsh-audio__group">
          <span className="dsh-audio__label">{t.loop}</span>
          <select aria-label={t.loop} value={loopMode} onChange={(event) => setLoopMode(event.target.value as LoopMode)}>
            <option value="off">{t.loopOff}</option>
            <option value="all">{t.loopAll}</option>
            <option value="ab" disabled={loopWindow === null}>{t.loopAb}</option>
          </select>
        </span>
        <span className="dsh-audio__group">
          <button
            type="button"
            data-active={muted}
            onClick={() => setMuted(current => !current)}
            aria-label={muted ? t.unmute : t.mute}
            title={muted ? t.unmute : t.mute}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            aria-label={t.volume}
            onChange={(event) => setVolume(Number(event.target.value))}
          />
        </span>
        <span className="dsh-audio__group">
          <span className="dsh-audio__label">{t.channel}</span>
          <select
            aria-label={t.channel}
            value={channel === 'mix' ? 'mix' : String(channel)}
            onChange={(event) => setChannel(event.target.value === 'mix' ? 'mix' : Number(event.target.value))}
          >
            <option value="mix">{t.channelMix}</option>
            {Array.from({ length: decoded?.channels ?? 0 }, (_value, index) => (
              <option key={index} value={String(index)}>
                {decoded !== null && decoded.channels === 2
                  ? (index === 0 ? t.channelLeft : t.channelRight)
                  : t.channelN(index)}
              </option>
            ))}
          </select>
        </span>
        <span className="dsh-audio__group">
          <button type="button" data-active={showRms} onClick={() => setShowRms(current => !current)} title={t.rms}>
            {t.rms}
          </button>
          <button type="button" onClick={() => zoomBy(0.8)} aria-label={t.zoomIn} title={t.zoomIn}>＋</button>
          <button type="button" onClick={() => zoomBy(1.25)} aria-label={t.zoomOut} title={t.zoomOut}>－</button>
          <button type="button" onClick={fit} aria-label={t.zoomFit} title={t.zoomFit}>⤢</button>
        </span>
        <span className="dsh-audio__group">
          <span className="dsh-audio__label">{t.spectrum}</span>
          <select
            aria-label={t.spectrum}
            value={spectrumStyle}
            onChange={(event) => setSpectrumStyle(event.target.value as SpectrumStyle)}
          >
            <option value="bars">{t.spectrumBars}</option>
            <option value="line">{t.spectrumLine}</option>
            <option value="waterfall">{t.spectrumWaterfall}</option>
            <option value="off">{t.spectrumOff}</option>
          </select>
        </span>
        {selection !== null ? (
          <span className="dsh-audio__group dsh-audio__selection">
            <span>{t.selection}</span>
            <button
              type="button"
              className="dsh-audio__selection-value"
              onClick={() => setSelection(null)}
              aria-label={t.clearSelection}
              title={t.clearSelection}
            >
              ✕
            </button>
          </span>
        ) : null}
      </div>

      <div className="dsh-audio__notices">
        {notice !== null ? (
          <div className="dsh-audio__notice">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label={t.clearSelection}>✕</button>
          </div>
        ) : null}
        {decodeState.status === 'failed' ? (
          <div className="dsh-audio__notice">
            <span>{t.decodeFailed + (decodeState.error === undefined ? '' : ' — ' + decodeState.error)}</span>
          </div>
        ) : null}
        {audioFailure ? <div className="dsh-audio__notice"><span>{t.audioContextFailed}</span></div> : null}
      </div>

      <div
        className="dsh-audio__lane"
        ref={laneRef}
        data-view={effectiveView.start.toFixed(3) + '-' + effectiveView.end.toFixed(3)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { setCursor(null); dragRef.current = null }}
        onDoubleClick={onDoubleClick}
      >
        <canvas ref={laneCanvasRef} />
        <canvas ref={overlayCanvasRef} className="dsh-audio__lane-overlay" />
        <div className="dsh-audio__ruler">
          <canvas ref={rulerCanvasRef} />
        </div>
        {mainView === 'spectrogram' && heatmap.spec === null ? (
          <div className="dsh-audio__lane-empty">
            <span>
              {decodeState.status === 'running'
                ? t.decoding + '…' + (decodeProgress === null ? '' : ' ' + String(decodeProgress) + '%')
                : t.spectrogramPending}
            </span>
          </div>
        ) : null}
      </div>

      {spectrumStyle === 'off' ? null : (
      <div className="dsh-audio__spectrum">
        {spectrumLive ? null : (
          <div className="dsh-audio__spectrum-empty"><span>{t.spectrumIdle}</span></div>
        )}
        <canvas
          ref={spectrumCanvasRef}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            const canvas = spectrumCanvasRef.current
            const layout = layoutRef.current
            if (canvas === null || layout === null) return
            setCursorHz(frequencyAtX(event.clientX - rect.left, layout, canvas.width))
          }}
          onPointerLeave={() => setCursorHz(null)}
        />
      </div>
      )}

      <div className="dsh-audio__hint">
        <span className="dsh-audio__hint-readout" title={readout}>{readout}</span>
        <button
          type="button"
          className="dsh-audio__hint-help"
          aria-label={t.help}
          title={t.helpText}
        >
          ?
        </button>
      </div>
    </div>
  )
}
