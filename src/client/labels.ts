/**
 * Viewer copy, in the two languages this plugin ships (zh / en). The language
 * is picked from the browser's own preference list, with no registration into
 * the host locale registry — the plugin has one small surface and should not
 * depend on the host's i18n lifecycle.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/labels
 */

/** Language of the viewer chrome. */
export type Lang = 'zh' | 'en'

/** Every string the viewer renders. */
export interface Labels {
  play: string
  pause: string
  stop: string
  replay: string
  mute: string
  unmute: string
  volume: string
  rate: string
  loop: string
  loopOff: string
  loopAll: string
  loopAb: string
  channel: string
  channelMix: string
  channelLeft: string
  channelRight: string
  channelN: (index: number) => string
  view: string
  viewWaveform: string
  viewSpectrogram: string
  spectrogramPending: string
  spectrum: string
  spectrumBars: string
  spectrumLine: string
  spectrumWaterfall: string
  spectrumOff: string
  spectrumIdle: string
  rms: string
  zoomIn: string
  zoomOut: string
  zoomFit: string
  waveform: string
  decode: string
  decoding: string
  decodeFailed: string
  tooLong: string
  loadFailed: string
  loading: string
  selection: string
  clearSelection: string
  peak: string
  rmsReadout: string
  duration: string
  cursor: string
  peakFreq: string
  audioContextFailed: string
  help: string
  helpText: string
}

const zh: Labels = {
  play: '播放',
  pause: '暂停',
  stop: '停止',
  replay: '从头播放',
  mute: '静音',
  unmute: '取消静音',
  volume: '音量',
  rate: '倍速',
  loop: '循环',
  loopOff: '不循环',
  loopAll: '整曲循环',
  loopAb: '选区循环',
  channel: '声道',
  channelMix: '混合',
  channelLeft: '左声道',
  channelRight: '右声道',
  channelN: (index) => '声道 ' + String(index + 1),
  view: '视图',
  viewWaveform: '波形',
  viewSpectrogram: '频谱图',
  spectrogramPending: '正在计算频谱图…',
  spectrum: '频谱',
  spectrumBars: '柱状',
  spectrumLine: '折线',
  spectrumWaterfall: '瀑布',
  spectrumOff: '关闭',
  spectrumIdle: '播放后显示实时频谱',
  rms: 'RMS',
  zoomIn: '放大',
  zoomOut: '缩小',
  zoomFit: '适配',
  waveform: '波形',
  decode: '解码波形',
  decoding: '解码中',
  decodeFailed: '解码失败：浏览器无法解码该格式',
  tooLong: '文件过长（超过 30 分钟），只做流式播放、不生成波形与频谱图',
  loadFailed: '无法读取音频文件',
  loading: '加载中…',
  selection: '选区',
  clearSelection: '清除选区',
  peak: '峰值',
  rmsReadout: 'RMS',
  duration: '时长',
  cursor: '光标',
  peakFreq: '峰值频率',
  audioContextFailed: 'Web Audio 不可用，频谱已停用（仍可播放）',
  help: '操作说明',
  helpText: '点击 / 拖动波形：定位\nShift + 拖动：选择区间（选区循环、峰值与 RMS 读数）\nAlt + 拖动：平移　　滚轮：缩放　　双击：适配全曲\n空格：播放 / 暂停　　← / →：±5 秒（Shift 为 ±1 秒）　　Home / End：首尾\n+ / −：缩放　　M：静音　　L：循环模式',
}

const en: Labels = {
  play: 'Play',
  pause: 'Pause',
  stop: 'Stop',
  replay: 'Play from start',
  mute: 'Mute',
  unmute: 'Unmute',
  volume: 'Volume',
  rate: 'Speed',
  loop: 'Loop',
  loopOff: 'No loop',
  loopAll: 'Loop file',
  loopAb: 'Loop selection',
  channel: 'Channel',
  channelMix: 'Mix',
  channelLeft: 'Left',
  channelRight: 'Right',
  channelN: (index) => 'Channel ' + String(index + 1),
  view: 'View',
  viewWaveform: 'Waveform',
  viewSpectrogram: 'Spectrogram',
  spectrogramPending: 'Computing spectrogram…',
  spectrum: 'Spectrum',
  spectrumBars: 'Bars',
  spectrumLine: 'Line',
  spectrumWaterfall: 'Waterfall',
  spectrumOff: 'Off',
  spectrumIdle: 'Live spectrum appears during playback',
  rms: 'RMS',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomFit: 'Fit',
  waveform: 'Waveform',
  decode: 'Decode waveform',
  decoding: 'Decoding',
  decodeFailed: 'Decode failed: the browser cannot decode this format',
  tooLong: 'Very long file (over 30 minutes): streaming playback only, no waveform or spectrogram',
  loadFailed: 'Cannot read this audio file',
  loading: 'Loading…',
  selection: 'Selection',
  clearSelection: 'Clear selection',
  peak: 'Peak',
  rmsReadout: 'RMS',
  duration: 'Length',
  cursor: 'Cursor',
  peakFreq: 'Peak',
  audioContextFailed: 'Web Audio unavailable — spectrum disabled (playback still works)',
  help: 'Controls',
  helpText: 'Click / drag the waveform: seek\nShift + drag: select a range (A-B loop, peak and RMS read-out)\nAlt + drag: pan    Wheel: zoom    Double click: fit\nSpace: play/pause    Arrows: ±5 s (Shift: ±1 s)    Home / End: ends\n+ / −: zoom    M: mute    L: loop mode',
}

/**
 * Pick the viewer language from a preference list.
 * @param languages - navigator.languages-shaped list (may be undefined).
 * @returns 'zh' when a Chinese variant comes first among the known languages,
 *   otherwise 'en'.
 */
export function pickLang(languages?: readonly string[] | undefined): Lang {
  for (const entry of languages ?? []) {
    const tag = String(entry).toLowerCase()
    if (tag.startsWith('zh')) return 'zh'
    if (tag.startsWith('en')) return 'en'
  }
  return 'en'
}

/**
 * The dictionary for one language.
 * @param lang - the picked language.
 * @returns that language's labels.
 */
export function labelsFor(lang: Lang): Labels {
  return lang === 'zh' ? zh : en
}
