/**
 * Viewer copy, in the two languages this plugin ships (zh / en). The language
 * is picked from the browser's own preference list, with no registration into
 * the host locale registry — the plugin has one small surface and should not
 * depend on the host's i18n lifecycle.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/labels
 */
/** Language of the viewer chrome. */
export type Lang = 'zh' | 'en';
/** Every string the viewer renders. */
export interface Labels {
    play: string;
    pause: string;
    stop: string;
    replay: string;
    mute: string;
    unmute: string;
    volume: string;
    rate: string;
    loop: string;
    loopOff: string;
    loopAll: string;
    loopAb: string;
    channel: string;
    channelMix: string;
    channelLeft: string;
    channelRight: string;
    channelN: (index: number) => string;
    view: string;
    viewWaveform: string;
    viewSpectrogram: string;
    spectrogramPending: string;
    spectrum: string;
    spectrumBars: string;
    spectrumLine: string;
    spectrumWaterfall: string;
    spectrumOff: string;
    spectrumIdle: string;
    rms: string;
    zoomIn: string;
    zoomOut: string;
    zoomFit: string;
    waveform: string;
    decode: string;
    decoding: string;
    decodeFailed: string;
    tooLong: string;
    loadFailed: string;
    loading: string;
    selection: string;
    clearSelection: string;
    peak: string;
    rmsReadout: string;
    duration: string;
    cursor: string;
    peakFreq: string;
    audioContextFailed: string;
    help: string;
    helpText: string;
}
/**
 * Pick the viewer language from a preference list.
 * @param languages - navigator.languages-shaped list (may be undefined).
 * @returns 'zh' when a Chinese variant comes first among the known languages,
 *   otherwise 'en'.
 */
export declare function pickLang(languages?: readonly string[] | undefined): Lang;
/**
 * The dictionary for one language.
 * @param lang - the picked language.
 * @returns that language's labels.
 */
export declare function labelsFor(lang: Lang): Labels;
