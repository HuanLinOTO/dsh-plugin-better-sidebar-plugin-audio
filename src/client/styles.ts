/**
 * The viewer's stylesheet, injected once into the document head. Written as a
 * plain CSS string (not a CSS-module import) so the build needs no CSS plugin.
 *
 * Layout rules that matter (the panel is embedded in a resizable sidebar):
 *   - the main lane is the only flexible row, so it absorbs every spare pixel
 *     instead of leaving a gap under a fixed-height canvas;
 *   - every other row is `flex: 0 0 auto` with a fixed line height, so live
 *     read-outs that grow and shrink cannot reflow the panel;
 *   - notices float above the lane instead of pushing it around;
 *   - text selection is off except for the file name, so dragging the waveform
 *     never paints a browser selection over the UI.
 *
 * @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/styles
 */

/** Id of the injected style element. */
export const STYLE_ID = 'dsh-audio-preview-styles'

/** The stylesheet. */
export const VIEWER_CSS = `
.dsh-audio {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  height: 100%;
  min-height: 0;
  padding: 8px;
  box-sizing: border-box;
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-primary, #e6e9f0);
  background: var(--dsw-alias-bg-base, transparent);
  outline: none;
  user-select: none;
  -webkit-user-select: none;
}
.dsh-audio__title {
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  height: 18px;
}
.dsh-audio__name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: text;
  -webkit-user-select: text;
}
.dsh-audio__meta {
  color: var(--dsw-alias-label-secondary, #b9c0cf);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex: 0 0 auto;
}
.dsh-audio__bar {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}
.dsh-audio__group { display: inline-flex; align-items: center; gap: 4px; }
.dsh-audio__label { color: var(--dsw-alias-label-secondary, #b9c0cf); }
.dsh-audio__time {
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary, #e6e9f0);
}
.dsh-audio button,
.dsh-audio select {
  font: inherit;
  color: var(--dsw-alias-label-primary, #e6e9f0);
  background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.12));
  border: 1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.35));
  border-radius: 5px;
  padding: 1px 7px;
  cursor: pointer;
}
.dsh-audio select option { color: var(--dsw-alias-label-primary, #e6e9f0); background: var(--dsw-alias-bg-layer-1, #1b1d24); }
.dsh-audio button:hover,
.dsh-audio select:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.2)); }
.dsh-audio button[data-active="true"] {
  border-color: var(--dsw-alias-accent, #7aa2f7);
  color: var(--dsw-alias-accent, #7aa2f7);
}
.dsh-audio button:disabled { opacity: 0.45; cursor: default; }
.dsh-audio input[type="range"] { width: 84px; accent-color: var(--dsw-alias-accent, #7aa2f7); }
.dsh-audio__lane {
  position: relative;
  /* flex-basis 0 with an absolutely positioned canvas: the lane height comes
     from the sidebar alone, never from its own content, which is what used to
     feed a measure -> grow -> measure loop. */
  flex: 1 1 0;
  min-height: 90px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.25));
  border-radius: 6px;
  overflow: hidden;
  cursor: crosshair;
  touch-action: none;
  background: var(--dsw-alias-bg-layer-1, rgba(127, 127, 127, 0.06));
}
.dsh-audio__lane > canvas {
  display: block;
  position: absolute;
  top: 0;
  left: 0;
  /* A canvas is a replaced element: inset alone would leave it at its
     intrinsic size, so the box must be spelled out. */
  width: 100%;
  height: calc(100% - 18px);
}
.dsh-audio__lane > canvas.dsh-audio__lane-overlay {
  /* The playhead/cursor overlay sits on top of the data canvas and must never
     eat pointer events — the lane's own handlers drive seek/select/pan. */
  pointer-events: none;
}
.dsh-audio__ruler canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.dsh-audio__ruler {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 18px;
  box-sizing: border-box;
  border-top: 1px solid var(--dsw-alias-hairline, rgba(127, 127, 127, 0.2));
  background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.1));
}
.dsh-audio__lane-empty {
  position: absolute;
  inset: 0 0 18px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--dsw-alias-label-secondary, #b9c0cf);
  text-align: center;
  padding: 0 12px;
}
.dsh-audio__spectrum {
  position: relative;
  flex: 0 0 auto;
  height: 128px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.25));
  border-radius: 6px;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-1, rgba(127, 127, 127, 0.06));
}
.dsh-audio__spectrum canvas { display: block; width: 100%; height: 100%; }
.dsh-audio__spectrum-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-secondary, #b9c0cf);
  pointer-events: none;
}
.dsh-audio__hint {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 18px;
  color: var(--dsw-alias-label-secondary, #b9c0cf);
  font-variant-numeric: tabular-nums;
}
.dsh-audio__hint-readout {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsh-audio__hint-help {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  padding: 0;
  border-radius: 50%;
  line-height: 16px;
  text-align: center;
}
.dsh-audio__notices {
  position: absolute;
  left: 8px;
  right: 8px;
  top: 48px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 4px;
  pointer-events: none;
}
.dsh-audio__notice {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 5px;
  background: var(--dsw-alias-bg-layer-3, rgba(127, 127, 127, 0.22));
  border: 1px solid var(--dsw-alias-state-warn-primary, #d9a441);
  color: var(--dsw-alias-label-primary, #e6e9f0);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);
  pointer-events: auto;
  max-width: 100%;
}
.dsh-audio__notice span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-audio__error {
  padding: 8px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-state-error-primary, #f7768e);
  background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.12));
  color: var(--dsw-alias-label-primary, #e6e9f0);
  user-select: text;
  -webkit-user-select: text;
}
.dsh-audio__empty { padding: 12px; color: var(--dsw-alias-label-secondary, #b9c0cf); }
.dsh-audio__selection { color: var(--dsw-alias-accent, #7aa2f7); }
.dsh-audio__selection-value { font-variant-numeric: tabular-nums; }
`

/**
 * Inject the stylesheet once.
 * @param doc - target document (defaults to the ambient one).
 */
export function ensureViewerStyles(doc?: Document | undefined): void {
  const target = doc ?? (typeof document === 'undefined' ? undefined : document)
  if (target === undefined) return
  if (target.getElementById(STYLE_ID) !== null) return
  const style = target.createElement('style')
  style.id = STYLE_ID
  style.textContent = VIEWER_CSS
  target.head.appendChild(style)
}
