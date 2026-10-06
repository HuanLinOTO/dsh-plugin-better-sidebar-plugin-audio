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
import { type ReactNode } from 'react';
import { type ViewerData } from './source.ts';
/** Props handed over by the sidebar's editor host. */
export interface AudioViewerProps {
    /** Source facts from load(), or the failure to display. */
    data: ViewerData;
}
/**
 * Render the audio viewer.
 * @param props - the loaded source facts.
 * @returns the player pane, or the failure panel.
 */
export declare function AudioViewer({ data }: AudioViewerProps): ReactNode;
