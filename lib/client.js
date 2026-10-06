window.__ModuleLoader__.load({
	id: "@huanlin/dsh-plugin-better-sidebar-plugin-audio",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/audio-exts.ts
		/**
		* The audio extensions this plugin owns — one source of truth for BOTH halves:
		* the host route's whitelist (a non-audio path is refused, so the route can
		* never be used as a generic file download) and the client viewer's `exts`
		* (which decides that a file open lands in this preview at all).
		*
		* None of these extensions is claimed by DSH's own document preview: the host
		* lists mp3/wav/flac/ogg/m4a/aac/wma/opus under "known binary, no renderer"
		* (`ui-sidebar-documentpreview/src/client/document/unviewable.ts`) and
		* better-sidebar's `HOST_OWNED_EXTS` hands over only spreadsheets, PDF,
		* images and Office — so this viewer is the one that answers.
		*
		* @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/audio-exts
		*/
		/** Lower-case, dot-less audio extensions (shared by host and client). */
		const AUDIO_EXTS = [
			"mp3",
			"wav",
			"wave",
			"ogg",
			"oga",
			"opus",
			"flac",
			"m4a",
			"aac",
			"wma",
			"aif",
			"aiff",
			"amr",
			"ape",
			"caf",
			"mka"
		];
		new Set(AUDIO_EXTS);
		//#endregion
		//#region src/client/peaks.ts
		/** An empty envelope (used before decoding and for zero-length files). */
		function emptyChannelPeaks(columns = 0) {
			return {
				min: new Float32Array(columns),
				max: new Float32Array(columns),
				rms: new Float32Array(columns)
			};
		}
		/**
		* Bucket one channel's samples into display columns.
		* @param samples - normalized PCM in -1..1.
		* @param columns - number of display columns (>= 1).
		* @returns min/max/RMS per column; an empty file yields all-zero columns.
		*/
		function computeChannelPeaks(samples, columns) {
			const count = Math.max(1, Math.floor(columns));
			const min = new Float32Array(count);
			const max = new Float32Array(count);
			const rms = new Float32Array(count);
			const total = samples.length;
			for (let column = 0; column < count; column++) {
				const from = Math.floor(column * total / count);
				const to = column === count - 1 ? total : Math.floor((column + 1) * total / count);
				let low = 0;
				let high = 0;
				let sum = 0;
				let seen = 0;
				for (let index = from; index < to; index++) {
					const value = samples[index] ?? 0;
					if (value < low) low = value;
					if (value > high) high = value;
					sum += value * value;
					seen += 1;
				}
				min[column] = low;
				max[column] = high;
				rms[column] = seen === 0 ? 0 : Math.sqrt(sum / seen);
			}
			return {
				min,
				max,
				rms
			};
		}
		/**
		* Combine several channels into the "mix" envelope.
		* @param channels - per-channel envelopes of equal column count.
		* @returns min/max as the extremes across channels, RMS as the root of the
		*   mean square (so the mix never reads louder than its loudest channel).
		*/
		function mixChannelPeaks(channels) {
			const first = channels[0];
			if (first === void 0) return emptyChannelPeaks();
			const count = first.min.length;
			const min = new Float32Array(count);
			const max = new Float32Array(count);
			const rms = new Float32Array(count);
			for (let column = 0; column < count; column++) {
				let low = 0;
				let high = 0;
				let sum = 0;
				for (const channel of channels) {
					low = Math.min(low, channel.min[column] ?? 0);
					high = Math.max(high, channel.max[column] ?? 0);
					const value = channel.rms[column] ?? 0;
					sum += value * value;
				}
				min[column] = low;
				max[column] = high;
				rms[column] = Math.sqrt(sum / channels.length);
			}
			return {
				min,
				max,
				rms
			};
		}
		/** Smallest magnitude that still has a finite dB value (about -120 dBFS). */
		const DB_FLOOR = 1e-6;
		/**
		* Amplitude to dBFS.
		* @param value - linear amplitude in 0..1.
		* @returns dBFS, floored at about -120.
		*/
		function amplitudeToDb(value) {
			return 20 * Math.log10(Math.max(Math.abs(value), DB_FLOOR));
		}
		/**
		* Envelope statistics over a column window (used by the selection read-out).
		* @param channels - envelopes to read.
		* @param fromColumn - first column of the window (inclusive).
		* @param toColumn - last column of the window (inclusive).
		* @returns the loudest sample and the mean RMS across the window.
		*/
		function peaksWindowStats(channels, fromColumn, toColumn) {
			const first = channels[0];
			if (first === void 0) return {
				peak: 0,
				rms: 0
			};
			const last = first.min.length - 1;
			const from = Math.max(0, Math.min(Math.floor(fromColumn), Math.max(last, 0)));
			const to = Math.max(from, Math.min(Math.floor(toColumn), Math.max(last, 0)));
			let peak = 0;
			let sum = 0;
			let columns = 0;
			for (let column = from; column <= to; column++) {
				let columnRms = 0;
				for (const channel of channels) {
					peak = Math.max(peak, Math.abs(channel.min[column] ?? 0), Math.abs(channel.max[column] ?? 0));
					const value = channel.rms[column] ?? 0;
					columnRms += value * value;
				}
				sum += columnRms / Math.max(1, channels.length);
				columns += 1;
			}
			return {
				peak,
				rms: columns === 0 ? 0 : Math.sqrt(sum / columns)
			};
		}
		/**
		* Download a URL into memory.
		* @param url - the media URL.
		* @param options - abort signal and progress callback.
		* @returns the file bytes.
		* @throws {Error} on a non-OK response.
		*/
		async function fetchBytes(url, options = {}) {
			const response = await fetch(url, {
				signal: options.signal,
				headers: { accept: "audio/*" }
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const total = Number(response.headers.get("content-length") ?? "0");
			const reader = response.body?.getReader();
			if (reader === void 0) return await response.arrayBuffer();
			const chunks = [];
			let loaded = 0;
			for (;;) {
				const chunk = await reader.read();
				if (chunk.done) break;
				if (chunk.value !== void 0) {
					chunks.push(chunk.value);
					loaded += chunk.value.byteLength;
					options.onProgress?.(loaded, Number.isFinite(total) ? total : 0);
				}
			}
			const merged = new Uint8Array(loaded);
			let offset = 0;
			for (const chunk of chunks) {
				merged.set(chunk, offset);
				offset += chunk.byteLength;
			}
			return merged.buffer;
		}
		/** A decoding context, or null when the platform has none. */
		function defaultDecodeContext() {
			const scope = globalThis;
			if (scope.OfflineAudioContext !== void 0) return new scope.OfflineAudioContext(1, 1, 44100);
			const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
			return Ctor === void 0 ? null : new Ctor();
		}
		/**
		* Decode a file into per-channel envelopes.
		* @param data - the file bytes (consumed by `decodeAudioData`).
		* @param options - resolution and a decoding-context seam.
		* @returns duration, format info and envelopes.
		* @throws {Error} when Web Audio is unavailable or the bytes cannot be decoded.
		*/
		async function decodeAudio(data, options = {}) {
			const context = options.contextFactory?.() ?? defaultDecodeContext();
			if (context === null) throw new Error("Web Audio is unavailable");
			try {
				const buffer = await context.decodeAudioData(data);
				const columns = options.columns ?? 4e3;
				const peaks = [];
				const channelData = [];
				for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
					const samples = buffer.getChannelData(channel);
					channelData.push(samples);
					peaks.push(computeChannelPeaks(samples, columns));
				}
				const total = channelData[0]?.length ?? 0;
				const mono = options.keepMono === false ? void 0 : new Float32Array(total);
				if (mono !== void 0 && total > 0) {
					const scale = 1 / Math.max(1, channelData.length);
					for (const samples of channelData) for (let index = 0; index < total; index++) mono[index] = (mono[index] ?? 0) + (samples[index] ?? 0) * scale;
				}
				return {
					duration: buffer.duration,
					sampleRate: buffer.sampleRate,
					channels: buffer.numberOfChannels,
					peaks,
					columns,
					mono
				};
			} finally {
				const closable = context;
				if (typeof closable.close === "function") try {
					await closable.close();
				} catch {}
			}
		}
		//#endregion
		//#region src/client/spectrum.ts
		/** Analyser FFT size used by the viewer (2048 bins` => `1024 magnitude bins). */
		const FFT_SIZE = 2048;
		/**
		* Build a layout for one canvas size.
		* @param columns - canvas CSS width in pixels.
		* @param sampleRate - the AudioContext sample rate.
		* @param options - axis bounds and spacing.
		* @returns the layout.
		*/
		function spectrumLayout(columns, sampleRate, options = {}) {
			const fftSize = options.fftSize ?? 2048;
			const nyquist = Math.max(sampleRate, 1) / 2;
			const minHz = Math.max(0, Math.min(options.minHz ?? 30, nyquist));
			const maxHz = Math.max(minHz + 1, Math.min(options.maxHz ?? nyquist, nyquist));
			return {
				fftSize,
				sampleRate,
				columns: Math.max(1, Math.floor(columns)),
				minHz,
				maxHz,
				log: options.log ?? true
			};
		}
		/**
		* The bin window one column covers.
		* @param column - column index, in `[0, columns)`.
		* @param layout - the axis layout.
		* @returns inclusive-exclusive bin range `[from, to)`.
		*/
		function binRangeOfColumn(column, layout) {
			const bins = layout.fftSize / 2;
			const nyquist = layout.sampleRate / 2;
			const ratioFrom = column / layout.columns;
			const ratioTo = (column + 1) / layout.columns;
			const hzFrom = layout.log ? layout.minHz * Math.pow(layout.maxHz / layout.minHz, ratioFrom) : layout.minHz + (layout.maxHz - layout.minHz) * ratioFrom;
			const hzTo = layout.log ? layout.minHz * Math.pow(layout.maxHz / layout.minHz, ratioTo) : layout.minHz + (layout.maxHz - layout.minHz) * ratioTo;
			const from = Math.floor(hzFrom / nyquist * bins);
			const to = Math.max(from + 1, Math.ceil(hzTo / nyquist * bins));
			return {
				from: Math.max(0, Math.min(from, bins - 1)),
				to: Math.max(1, Math.min(to, bins))
			};
		}
		/**
		* Collapse analyser bins into one value per drawn column.
		* @param bins - `Uint8Array` straight from `getByteFrequencyData`.
		* @param layout - the axis layout.
		* @returns column magnitudes in 0..1.
		*/
		function collapseSpectrum(bins, layout) {
			const out = new Float32Array(layout.columns);
			for (let column = 0; column < layout.columns; column++) {
				const { from, to } = binRangeOfColumn(column, layout);
				let peak = 0;
				for (let bin = from; bin < to && bin < bins.length; bin++) peak = Math.max(peak, bins[bin] ?? 0);
				out[column] = peak / 255;
			}
			return out;
		}
		/**
		* The strongest bin in a frame.
		* @param bins - `Uint8Array` straight from `getByteFrequencyData`.
		* @param sampleRate - the AudioContext sample rate.
		* @param fftSize - the analyser's FFT size.
		* @returns the frequency of the loudest bin, in hertz (0 when silent).
		*/
		function peakFrequency(bins, sampleRate, fftSize) {
			let index = 0;
			let value = 0;
			for (let bin = 1; bin < bins.length; bin++) {
				const current = bins[bin] ?? 0;
				if (current > value) {
					value = current;
					index = bin;
				}
			}
			if (value === 0) return 0;
			return index * sampleRate / fftSize;
		}
		/**
		* Frequency ruler labels across the axis.
		* @param layout - the axis layout.
		* @param width - canvas width in CSS pixels.
		* @returns ticks with their pixel offset and label.
		*/
		function frequencyTicks(layout, width) {
			const candidates = [
				50,
				100,
				200,
				500,
				1e3,
				2e3,
				5e3,
				1e4,
				2e4
			];
			const out = [];
			for (const hz of candidates) {
				if (hz < layout.minHz || hz > layout.maxHz) continue;
				const ratio = layout.log ? Math.log(hz / layout.minHz) / Math.log(layout.maxHz / layout.minHz) : (hz - layout.minHz) / (layout.maxHz - layout.minHz);
				out.push({
					hz,
					x: ratio * width,
					label: hz >= 1e3 ? `${hz / 1e3}k` : `${hz}`
				});
			}
			return out;
		}
		/**
		* Pixel offset of one frequency on the spectrum axis.
		* @param hz - frequency in hertz.
		* @param layout - the axis layout.
		* @param width - canvas width in CSS pixels.
		* @returns the pixel offset (clamped to the canvas).
		*/
		function frequencyToX(hz, layout, width) {
			if (hz <= 0 || layout.maxHz <= layout.minHz) return 0;
			const ratio = layout.log ? Math.log(hz / layout.minHz) / Math.log(layout.maxHz / layout.minHz) : (hz - layout.minHz) / (layout.maxHz - layout.minHz);
			return Math.min(Math.max(ratio, 0), 1) * width;
		}
		/**
		* Frequency under a pixel on the spectrum axis.
		* @param x - pixel offset.
		* @param layout - the axis layout.
		* @param width - canvas width in CSS pixels.
		* @returns the frequency at that pixel.
		*/
		function frequencyAtX(x, layout, width) {
			const ratio = width <= 0 ? 0 : Math.min(Math.max(x / width, 0), 1);
			return layout.log ? layout.minHz * Math.pow(layout.maxHz / layout.minHz, ratio) : layout.minHz + (layout.maxHz - layout.minHz) * ratio;
		}
		//#endregion
		//#region src/client/waterfall.ts
		/** Dark-skin ramp: near-black to hot yellow. */
		const RAMP_DARK = [
			[
				8,
				12,
				28
			],
			[
				20,
				46,
				96
			],
			[
				24,
				96,
				128
			],
			[
				46,
				158,
				110
			],
			[
				166,
				196,
				72
			],
			[
				248,
				216,
				96
			],
			[
				255,
				252,
				214
			]
		];
		/** Light-skin ramp: white to deep indigo (the same ramp, inverted). */
		const RAMP_LIGHT = [
			[
				252,
				253,
				255
			],
			[
				214,
				230,
				246
			],
			[
				162,
				202,
				232
			],
			[
				104,
				162,
				212
			],
			[
				58,
				116,
				186
			],
			[
				38,
				76,
				158
			],
			[
				24,
				34,
				96
			]
		];
		/**
		* Map one magnitude onto an RGB triple.
		* @param magnitude - column magnitude in 0..1.
		* @param variant - active skin; the ramp inverts for a light one.
		* @returns a triple, each component 0..255.
		*/
		function magnitudeColor(magnitude, variant = "dark") {
			const ramp = variant === "light" ? RAMP_LIGHT : RAMP_DARK;
			const scaled = (Number.isFinite(magnitude) ? Math.min(Math.max(magnitude, 0), 1) : 0) * (ramp.length - 1);
			const index = Math.min(Math.floor(scaled), ramp.length - 2);
			const fraction = scaled - index;
			const from = ramp[index] ?? ramp[0];
			const to = ramp[index + 1] ?? ramp[ramp.length - 1];
			return [
				Math.round(from[0] + (to[0] - from[0]) * fraction),
				Math.round(from[1] + (to[1] - from[1]) * fraction),
				Math.round(from[2] + (to[2] - from[2]) * fraction)
			];
		}
		/**
		* A fixed-size grid of spectrum rows: newest row last, oldest dropped.
		* Row-major byte array of width * height cells, one byte per cell.
		*/
		var WaterfallBuffer = class {
			/** Grid width in pixels (spectrum columns). */
			width;
			/** Grid height in pixels (history depth). */
			height;
			pixels;
			filled = 0;
			constructor(width, height) {
				this.width = Math.max(1, Math.floor(width));
				this.height = Math.max(1, Math.floor(height));
				this.pixels = new Uint8Array(this.width * this.height);
			}
			/** How many rows have been written (capped at the grid height). */
			get rows() {
				return this.filled;
			}
			/**
			* Push one spectrum row, scrolling the older rows up.
			* @param values - one magnitude per column (0..1); short input is zero-padded.
			*/
			push(values) {
				const { width, height } = this;
				this.pixels.copyWithin(0, width);
				const base = (height - 1) * width;
				for (let column = 0; column < width; column++) {
					const value = values[column] ?? 0;
					this.pixels[base + column] = Math.round(Math.min(Math.max(value, 0), 1) * 255);
				}
				this.filled = Math.min(height, this.filled + 1);
			}
			/** Drop all history. */
			clear() {
				this.pixels.fill(0);
				this.filled = 0;
			}
			/**
			* Read one magnitude back.
			* @param column - column index.
			* @param row - row index (0 = oldest).
			* @returns the stored magnitude in 0..1, or 0 outside the grid.
			*/
			at(column, row) {
				if (column < 0 || row < 0 || column >= this.width || row >= this.height) return 0;
				return (this.pixels[row * this.width + column] ?? 0) / 255;
			}
			/**
			* Render the grid into an RGBA buffer.
			* @param out - destination of width * height * 4 bytes (may be reused).
			* @param variant - active skin (the ramp inverts for a light one).
			* @returns the same buffer, filled.
			*/
			render(out, variant = "dark") {
				const size = this.width * this.height;
				for (let index = 0; index < size; index++) {
					const [r, g, b] = magnitudeColor((this.pixels[index] ?? 0) / 255, variant);
					out[index * 4] = r;
					out[index * 4 + 1] = g;
					out[index * 4 + 2] = b;
					out[index * 4 + 3] = 255;
				}
				return out;
			}
		};
		//#endregion
		//#region src/client/fft.ts
		/**
		* A small radix-2 FFT, written here rather than pulled in as a dependency: the
		* spectrogram needs exactly one transform (power-of-two, real input, power
		* spectrum), and the plugin must stay dependency-free.
		*
		* @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/fft
		*/
		/**
		* Whether a length is a power of two.
		* @param value - candidate length.
		* @returns true for 1, 2, 4, 8, …
		*/
		function isPowerOfTwo(value) {
			return Number.isInteger(value) && value > 0 && (value & value - 1) === 0;
		}
		/**
		* Iterative in-place radix-2 FFT (Cooley–Tukey, decimation in time).
		* @param re - real parts, length must be a power of two.
		* @param im - imaginary parts, same length as `re`.
		* @throws {Error} when the lengths differ or are not a power of two.
		*/
		function fftInPlace(re, im) {
			const size = re.length;
			if (size !== im.length) throw new Error("fftInPlace: real and imaginary parts must have equal length");
			if (size === 0) return;
			if (!isPowerOfTwo(size)) throw new Error("fftInPlace: length must be a power of two");
			for (let index = 1, reversed = 0; index < size; index++) {
				let bit = size >> 1;
				for (; (reversed & bit) !== 0; bit >>= 1) reversed ^= bit;
				reversed ^= bit;
				if (index < reversed) {
					const swapRe = re[index] ?? 0;
					re[index] = re[reversed] ?? 0;
					re[reversed] = swapRe;
					const swapIm = im[index] ?? 0;
					im[index] = im[reversed] ?? 0;
					im[reversed] = swapIm;
				}
			}
			for (let span = 2; span <= size; span <<= 1) {
				const angle = -2 * Math.PI / span;
				const stepRe = Math.cos(angle);
				const stepIm = Math.sin(angle);
				const half = span >> 1;
				for (let base = 0; base < size; base += span) {
					let curRe = 1;
					let curIm = 0;
					for (let offset = 0; offset < half; offset++) {
						const evenIndex = base + offset;
						const oddIndex = evenIndex + half;
						const oddRe = re[oddIndex] ?? 0;
						const oddIm = im[oddIndex] ?? 0;
						const vRe = oddRe * curRe - oddIm * curIm;
						const vIm = oddRe * curIm + oddIm * curRe;
						const uRe = re[evenIndex] ?? 0;
						const uIm = im[evenIndex] ?? 0;
						re[evenIndex] = uRe + vRe;
						im[evenIndex] = uIm + vIm;
						re[oddIndex] = uRe - vRe;
						im[oddIndex] = uIm - vIm;
						const nextRe = curRe * stepRe - curIm * stepIm;
						curIm = curRe * stepIm + curIm * stepRe;
						curRe = nextRe;
					}
				}
			}
		}
		/**
		* A periodic Hann window.
		* @param size - window length in samples.
		* @returns the window (zero-length input yields a zero-length window).
		*/
		function hannWindow(size) {
			const window = new Float32Array(Math.max(0, Math.floor(size)));
			const last = Math.max(1, window.length - 1);
			for (let index = 0; index < window.length; index++) window[index] = .5 - .5 * Math.cos(2 * Math.PI * index / last);
			return window;
		}
		/**
		* Power spectrum of a transformed frame (the first half of the bins).
		* @param re - transformed real parts.
		* @param im - transformed imaginary parts.
		* @param out - optional destination (reused across frames).
		* @returns magnitudes, one per bin below Nyquist.
		*/
		function magnitudes(re, im, out) {
			const half = Math.max(0, Math.floor(re.length / 2));
			const result = out ?? new Float32Array(half);
			for (let bin = 0; bin < half; bin++) {
				const real = re[bin] ?? 0;
				const imaginary = im[bin] ?? 0;
				result[bin] = Math.sqrt(real * real + imaginary * imaginary);
			}
			return result;
		}
		/**
		* Analyze one frame of samples into its power spectrum.
		* @param samples - source samples (short frames are zero-padded).
		* @param window - windowing function; pass undefined for a rectangular window.
		* @param scratch - reusable buffers (same layout as the transform length).
		* @returns the magnitudes, one per bin below Nyquist.
		*/
		function analyzeFrame(samples, window, scratch) {
			const size = scratch.re.length;
			for (let index = 0; index < size; index++) {
				const value = samples[index] ?? 0;
				scratch.re[index] = window === void 0 ? value : value * (window[index] ?? 1);
				scratch.im[index] = 0;
			}
			fftInPlace(scratch.re, scratch.im);
			return magnitudes(scratch.re, scratch.im, scratch.magnitudes);
		}
		//#endregion
		//#region src/client/spectrogram.ts
		/** Transform size (1024 -> 512 bins). */
		const DEFAULT_FFT_SIZE = 1024;
		/**
		* Mel of a frequency (the classic 2595 * log10(1 + hz / 700) form).
		* @param hz - frequency in hertz.
		* @returns the mel value.
		*/
		function hzToMel(hz) {
			return 2595 * Math.log10(1 + Math.max(0, hz) / 700);
		}
		/**
		* Inverse of {@link hzToMel}.
		* @param mel - mel value.
		* @returns the frequency in hertz.
		*/
		function melToHz(mel) {
			return 700 * (Math.pow(10, mel / 2595) - 1);
		}
		/**
		* Frequency window covered by one band.
		* @param band - band index, 0 = lowest frequency.
		* @param bands - total band count.
		* @param minHz - axis lower bound.
		* @param maxHz - axis upper bound.
		* @param scale - frequency spacing.
		* @returns the band's frequency window.
		*/
		function bandFrequencyRange(band, bands, minHz, maxHz, scale) {
			const count = Math.max(1, bands);
			const ratioFrom = band / count;
			const ratioTo = (band + 1) / count;
			if (scale === "mel" && minHz > 0) {
				const low = hzToMel(minHz);
				const high = hzToMel(maxHz);
				return {
					from: melToHz(low + (high - low) * ratioFrom),
					to: melToHz(low + (high - low) * ratioTo)
				};
			}
			if (scale === "log" && minHz > 0) {
				const span = maxHz / minHz;
				return {
					from: minHz * Math.pow(span, ratioFrom),
					to: minHz * Math.pow(span, ratioTo)
				};
			}
			return {
				from: minHz + (maxHz - minHz) * ratioFrom,
				to: minHz + (maxHz - minHz) * ratioTo
			};
		}
		/** Below this level the input counts as silence (no normalization). */
		const SILENT_DB = -100;
		/**
		* Compute the spectrogram of one time window.
		* @param mono - downmixed PCM of the whole file.
		* @param sampleRate - sample rate of `mono`.
		* @param options - window, resolution and axis settings.
		* @returns the grid, sized to the requested columns and bands.
		*/
		function computeSpectrogramWindow(mono, sampleRate, options) {
			const requestedFft = options.fftSize ?? 1024;
			const fftSize = isPowerOfTwo(requestedFft) ? requestedFft : DEFAULT_FFT_SIZE;
			const columns = Math.max(1, Math.floor(options.columns ?? 512));
			const bands = Math.max(1, Math.min(512, Math.floor(options.bands ?? 256)));
			const scale = options.scale ?? "mel";
			const rangeDb = Math.max(6, options.rangeDb ?? 78);
			const nyquist = Math.max(sampleRate, 1) / 2;
			const minHz = Math.max(0, Math.min(options.minHz ?? 30, nyquist));
			const maxHz = Math.max(minHz + 1, Math.min(options.maxHz ?? nyquist, nyquist));
			const startTime = Number.isFinite(options.startTime) ? Math.max(0, options.startTime) : 0;
			const endTime = Number.isFinite(options.endTime) ? Math.max(startTime + 1e-6, options.endTime) : startTime + 1e-6;
			const spec = {
				columns,
				bands,
				data: new Uint8Array(columns * bands),
				startTime,
				endTime,
				minHz,
				maxHz,
				scale
			};
			if (mono.length === 0) return spec;
			const window = hannWindow(fftSize);
			const scratch = {
				re: new Float32Array(fftSize),
				im: new Float32Array(fftSize),
				magnitudes: new Float32Array(fftSize / 2)
			};
			const frame = new Float32Array(fftSize);
			const bins = fftSize / 2;
			const binHz = sampleRate / fftSize;
			const ranges = [];
			for (let band = 0; band < bands; band++) ranges.push(bandFrequencyRange(band, bands, minHz, maxHz, scale));
			const binOf = (hz) => Math.min(bins, Math.max(0, Math.round(hz / binHz)));
			const span = endTime - startTime;
			const half = fftSize >> 1;
			const dbGrid = new Float32Array(columns * bands);
			let peakDb = -Infinity;
			for (let column = 0; column < columns; column++) {
				const center = startTime + (column + .5) / columns * span;
				const first = Math.round(center * sampleRate) - half;
				for (let index = 0; index < fftSize; index++) {
					const source = first + index;
					frame[index] = source >= 0 && source < mono.length ? mono[source] ?? 0 : 0;
				}
				const magnitudes = analyzeFrame(frame, window, scratch);
				for (let band = 0; band < bands; band++) {
					const range = ranges[band] ?? {
						from: minHz,
						to: maxHz
					};
					const from = binOf(range.from);
					const to = Math.max(from + 1, binOf(range.to));
					let peak = 0;
					for (let bin = from; bin < to && bin < magnitudes.length; bin++) peak = Math.max(peak, magnitudes[bin] ?? 0);
					const db = 20 * Math.log10(peak / (fftSize / 4) + 1e-9);
					dbGrid[band * columns + column] = db;
					if (db > peakDb) peakDb = db;
				}
			}
			const floorDb = peakDb - rangeDb;
			if (Number.isFinite(peakDb) && peakDb > SILENT_DB && peakDb - floorDb > 1) for (let index = 0; index < dbGrid.length; index++) {
				const db = dbGrid[index] ?? -Infinity;
				const scaled = Number.isFinite(db) ? (db - floorDb) / rangeDb : 0;
				spec.data[index] = Math.round(Math.min(Math.max(scaled, 0), 1) * 255);
			}
			return spec;
		}
		/**
		* Render the grid into an RGBA buffer, highest frequency on the top row.
		* @param spec - the grid.
		* @param out - destination of columns * bands * 4 bytes.
		* @param variant - active skin (the colour ramp inverts for a light one).
		* @returns the same buffer, filled.
		*/
		function renderSpectrogramRgba(spec, out, variant = "dark") {
			const { columns, bands } = spec;
			for (let band = 0; band < bands; band++) {
				const row = bands - 1 - band;
				for (let column = 0; column < columns; column++) {
					const [r, g, b] = magnitudeColor((spec.data[band * columns + column] ?? 0) / 255, variant);
					const offset = (row * columns + column) * 4;
					out[offset] = r;
					out[offset + 1] = g;
					out[offset + 2] = b;
					out[offset + 3] = 255;
				}
			}
			return out;
		}
		//#endregion
		//#region src/client/view.ts
		/** Tightest window the viewer allows (20 ms — about one cycle at 50 Hz). */
		const MIN_SPAN_SECONDS = .02;
		/**
		* The whole-file window.
		* @param duration - file duration in seconds.
		* @returns a window spanning the file (never zero-length).
		*/
		function fullView(duration) {
			return {
				start: 0,
				end: Math.max(duration, MIN_SPAN_SECONDS)
			};
		}
		/**
		* Force a window into the file's bounds, respecting the minimum span.
		* @param view - requested window (may be inverted, NaN, or out of bounds).
		* @param duration - file duration in seconds.
		* @param minSpan - smallest allowed span in seconds.
		* @returns a valid window inside `[0, duration]`.
		*/
		function clampView(view, duration, minSpan = MIN_SPAN_SECONDS) {
			const total = Math.max(duration, 0);
			const floor = Math.min(minSpan, total > 0 ? total : minSpan);
			const maxSpan = Math.max(total, floor);
			const requested = view.end - view.start;
			let span = Number.isFinite(requested) && requested > 0 ? requested : maxSpan;
			span = Math.min(Math.max(span, floor), maxSpan);
			let start = Number.isFinite(view.start) ? view.start : 0;
			if (start < 0) start = 0;
			if (start + span > total) start = Math.max(0, total - span);
			return {
				start,
				end: start + span
			};
		}
		/**
		* Zoom around a focus time.
		* @param view - current window.
		* @param focus - time that must stay under the cursor.
		* @param factor - < 1 zooms in, > 1 zooms out.
		* @param duration - file duration in seconds.
		* @param minSpan - smallest allowed span in seconds.
		* @returns the zoomed window.
		*/
		function zoomView(view, focus, factor, duration, minSpan = MIN_SPAN_SECONDS) {
			const span = view.end - view.start;
			const next = span * factor;
			const start = focus - next * (span <= 0 ? .5 : Math.min(Math.max((focus - view.start) / span, 0), 1));
			return clampView({
				start,
				end: start + next
			}, duration, minSpan);
		}
		/**
		* Time under one horizontal pixel.
		* @param view - current window.
		* @param x - pixel offset.
		* @param width - canvas width in CSS pixels.
		* @returns the time at that pixel.
		*/
		function timeAtX(view, x, width) {
			if (width <= 0) return view.start;
			return view.start + (view.end - view.start) * (x / width);
		}
		/**
		* Pixel offset of one time.
		* @param view - current window.
		* @param time - seconds.
		* @param width - canvas width in CSS pixels.
		* @returns the pixel offset (may fall outside the canvas).
		*/
		function xAtTime(view, time, width) {
			const span = view.end - view.start;
			if (span <= 0) return 0;
			return (time - view.start) / span * width;
		}
		/** Candidate ruler steps, in seconds (1 ms to 1 h). */
		const TICK_STEPS = [
			.001,
			.002,
			.005,
			.01,
			.02,
			.05,
			.1,
			.2,
			.5,
			1,
			2,
			5,
			10,
			15,
			30,
			60,
			120,
			300,
			600,
			900,
			1800,
			3600
		];
		/**
		* Pick a ruler step for a window.
		* @param span - visible span in seconds.
		* @param width - canvas width in CSS pixels.
		* @param minPx - smallest accepted spacing between ticks.
		* @returns the step in seconds.
		*/
		function tickStep(span, width, minPx = 72) {
			const maxTicks = Math.max(1, Math.floor(Math.max(width, 1) / minPx));
			const ideal = Math.max(span, 0) / maxTicks;
			for (const step of TICK_STEPS) if (step >= ideal) return step;
			return TICK_STEPS[TICK_STEPS.length - 1] ?? 3600;
		}
		/**
		* Ruler tick positions for a window.
		* @param view - current window.
		* @param width - canvas width in CSS pixels.
		* @param minPx - smallest accepted spacing between ticks.
		* @returns times to label, in ascending order.
		*/
		function ticks(view, width, minPx = 72) {
			const step = tickStep(view.end - view.start, width, minPx);
			const first = Math.ceil(view.start / step) * step;
			const out = [];
			for (let time = first; time <= view.end + step * 1e-6 && out.length < 512; time += step) if (time >= view.start - step * 1e-6) out.push(Number(time.toFixed(6)));
			return out;
		}
		/**
		* Format a position on the timeline.
		* @param seconds - time in seconds (negative clamps to 0).
		* @param millis - include milliseconds (used for the cursor read-out).
		* @returns `m:ss` / `h:mm:ss`, with `.mmm` when requested.
		*/
		function formatTime(seconds, millis = false) {
			const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
			const hours = Math.floor(safe / 3600);
			const minutes = Math.floor(safe % 3600 / 60);
			const whole = Math.floor(safe % 60);
			const base = hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(whole).padStart(2, "0")}` : `${minutes}:${String(whole).padStart(2, "0")}`;
			if (!millis) return base;
			return `${base}.${String(Math.floor(safe % 1 * 1e3)).padStart(3, "0")}`;
		}
		/**
		* Format a frequency for the spectrum read-out / ruler.
		* @param hz - frequency in hertz.
		* @returns `nn Hz` below 1 kHz, `n.nn kHz` above.
		*/
		function formatHz(hz) {
			if (!Number.isFinite(hz) || hz <= 0) return "0 Hz";
			if (hz < 1e3) return `${Math.round(hz)} Hz`;
			return `${(hz / 1e3).toFixed(hz < 1e4 ? 2 : 1)} kHz`;
		}
		//#endregion
		//#region src/client/draw.ts
		/** Monospace stack for axis labels (canvas cannot use the host font tokens). */
		const LABEL_FONT = "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
		/**
		* Clamp a painted y coordinate to a pixel inside the canvas.
		* @param y - the coordinate.
		* @param height - canvas height in CSS pixels.
		* @returns a whole pixel row that can actually be drawn.
		*/
		function clampPixel(y, height) {
			return Math.min(Math.max(Math.round(y), 0), Math.max(0, height - 1));
		}
		/**
		* Paint the waveform: time grid, envelope, RMS overlay, selection, playhead.
		* @param g - a 2D context already scaled for the device pixel ratio.
		* @param paint - geometry, data and palette.
		*/
		function drawWaveform(g, paint) {
			const { width, height, view, peaks, colors } = paint;
			g.clearRect(0, 0, width, height);
			const middle = height / 2;
			const columns = peaks.min.length;
			g.strokeStyle = colors.grid;
			g.lineWidth = 1;
			for (const time of ticks(view, width)) {
				const x = Math.round(xAtTime(view, time, width)) + .5;
				g.beginPath();
				g.moveTo(x, 0);
				g.lineTo(x, height);
				g.stroke();
			}
			if (paint.selection !== null) {
				const from = xAtTime(view, paint.selection.start, width);
				const to = xAtTime(view, paint.selection.end, width);
				g.fillStyle = colors.selection;
				g.fillRect(Math.min(from, to), 0, Math.abs(to - from), height);
				g.strokeStyle = colors.selectionEdge;
				g.beginPath();
				g.moveTo(Math.round(from) + .5, 0);
				g.lineTo(Math.round(from) + .5, height);
				g.moveTo(Math.round(to) + .5, 0);
				g.lineTo(Math.round(to) + .5, height);
				g.stroke();
			}
			g.strokeStyle = colors.axis;
			g.beginPath();
			g.moveTo(0, Math.round(middle) + .5);
			g.lineTo(width, Math.round(middle) + .5);
			g.stroke();
			if (columns > 0 && width > 0) {
				const gain = middle * .94;
				const total = paint.duration;
				const span = view.end - view.start;
				const rangeOf = (x) => {
					let from;
					let to;
					if (total > 0) {
						const origin = paint.peaksStart;
						const t0 = view.start + x / width * span - origin;
						const t1 = view.start + (x + 1) / width * span - origin;
						from = Math.floor(Math.min(Math.max(t0 / total * columns, 0), columns));
						to = Math.ceil(Math.min(Math.max(t1 / total * columns, 0), columns));
					} else {
						from = Math.floor(x / width * columns);
						to = Math.ceil((x + 1) / width * columns);
					}
					return {
						from,
						to: Math.min(Math.max(to, from + 1), columns)
					};
				};
				g.fillStyle = colors.wavePeak;
				for (let x = 0; x < width; x++) {
					const { from, to } = rangeOf(x);
					let low = 0;
					let high = 0;
					for (let column = from; column < to; column++) {
						low = Math.min(low, peaks.min[column] ?? 0);
						high = Math.max(high, peaks.max[column] ?? 0);
					}
					const top = clampPixel(middle - high * gain, height);
					const bottom = clampPixel(middle - low * gain, height);
					g.fillRect(x, top, 1, Math.max(1, bottom - top));
				}
				if (paint.showRms) {
					g.fillStyle = colors.waveRms;
					for (let x = 0; x < width; x++) {
						const { from, to } = rangeOf(x);
						let sum = 0;
						let seen = 0;
						for (let column = from; column < to; column++) {
							const value = peaks.rms[column] ?? 0;
							sum += value * value;
							seen += 1;
						}
						const value = (seen === 0 ? 0 : Math.sqrt(sum / seen)) * gain;
						g.fillRect(x, middle - value, 1, Math.max(1, value * 2));
					}
				}
			}
			if (paint.playhead !== null) {
				const x = Math.round(xAtTime(view, paint.playhead, width)) + .5;
				g.fillStyle = colors.playhead;
				g.fillRect(x, 0, 1.5, height);
			}
		}
		/**
		* Paint the time ruler under the main lane.
		* @param g - a 2D context already scaled for the device pixel ratio.
		* @param paint - geometry, window and palette.
		*/
		function drawTimeRuler(g, paint) {
			const { width, height, view, colors } = paint;
			g.clearRect(0, 0, width, height);
			g.font = LABEL_FONT;
			g.textBaseline = "middle";
			const withMillis = tickStep(view.end - view.start, width) < 1;
			for (const time of ticks(view, width)) {
				const x = Math.round(xAtTime(view, time, width)) + .5;
				g.strokeStyle = colors.grid;
				g.beginPath();
				g.moveTo(x, 0);
				g.lineTo(x, 4);
				g.stroke();
				g.fillStyle = colors.text;
				g.fillText(formatTime(time, withMillis), Math.min(x + 4, Math.max(0, width - 52)), height / 2 + 1);
			}
			g.strokeStyle = colors.axis;
			g.lineWidth = 1;
			g.beginPath();
			g.moveTo(0, .5);
			g.lineTo(width, .5);
			g.stroke();
		}
		/** Height of the frequency ruler strip inside a spectrum canvas. */
		const SPECTRUM_RULER = 13;
		/**
		* Paint the live spectrum.
		* @param g - a 2D context already scaled for the device pixel ratio.
		* @param paint - geometry, magnitudes and palette.
		*/
		function drawSpectrum(g, paint) {
			const { width, height, values, colors, layout } = paint;
			const plot = Math.max(1, height - SPECTRUM_RULER);
			g.clearRect(0, 0, width, height);
			g.font = LABEL_FONT;
			g.textBaseline = "top";
			g.strokeStyle = colors.spectrumGrid;
			g.lineWidth = 1;
			for (const tick of frequencyTicks(layout, width)) {
				const x = Math.round(tick.x) + .5;
				g.beginPath();
				g.moveTo(x, 0);
				g.lineTo(x, plot);
				g.stroke();
				g.fillStyle = colors.text;
				g.fillText(tick.label, Math.min(x + 3, Math.max(0, width - 26)), plot + 1);
			}
			if (paint.style === "bars") {
				g.fillStyle = colors.spectrum;
				for (let x = 0; x < width; x++) {
					const barHeight = (values[x] ?? 0) * plot;
					if (barHeight <= 0) continue;
					g.fillRect(x, plot - barHeight, 1, barHeight);
				}
			} else {
				g.beginPath();
				g.moveTo(0, plot);
				for (let x = 0; x < width; x++) g.lineTo(x, plot - (values[x] ?? 0) * plot);
				g.lineTo(Math.max(0, width - 1), plot);
				g.closePath();
				g.fillStyle = colors.spectrumFill;
				g.fill();
				g.beginPath();
				for (let x = 0; x < width; x++) {
					const y = plot - (values[x] ?? 0) * plot;
					if (x === 0) g.moveTo(x, y);
					else g.lineTo(x, y);
				}
				g.strokeStyle = colors.spectrum;
				g.lineWidth = 1.5;
				g.stroke();
			}
			if (paint.cursorHz !== null && paint.cursorHz > 0) {
				const x = Math.round(frequencyToX(paint.cursorHz, layout, width)) + .5;
				g.strokeStyle = colors.axis;
				g.beginPath();
				g.moveTo(x, 0);
				g.lineTo(x, plot);
				g.stroke();
			}
			if (paint.peakHz !== null && paint.peakHz > 0) {
				const x = Math.round(frequencyToX(paint.peakHz, layout, width)) + .5;
				g.strokeStyle = colors.accent;
				g.setLineDash([3, 3]);
				g.beginPath();
				g.moveTo(x, 0);
				g.lineTo(x, plot);
				g.stroke();
				g.setLineDash([]);
				g.fillStyle = colors.accent;
				g.fillText(formatHz(paint.peakHz), Math.min(x + 3, Math.max(0, width - 56)), 1);
			}
		}
		/**
		* Blit a waterfall frame.
		* @param g - a 2D context already scaled for the device pixel ratio.
		* @param frame - the RGBA frame, sized to the canvas.
		*/
		function drawWaterfallFrame(g, frame) {
			g.putImageData(frame, 0, 0);
		}
		/**
		* Paint the whole-file spectrogram over the visible window.
		* @param g - a 2D context already scaled for the device pixel ratio.
		* @param paint - geometry, the heat map and the palette.
		*/
		function drawSpectrogramFrame(g, paint) {
			const { width, height, view, colors, spec } = paint;
			g.clearRect(0, 0, width, height);
			const plot = height;
			if (paint.image !== null && spec.columns > 0 && spec.bands > 0) {
				g.imageSmoothingEnabled = false;
				try {
					g.drawImage(paint.image, 0, 0, spec.columns, spec.bands, 0, 0, width, plot);
				} catch {}
			}
			g.strokeStyle = colors.grid;
			g.lineWidth = 1;
			for (const time of ticks(view, width)) {
				const x = Math.round(xAtTime(view, time, width)) + .5;
				g.beginPath();
				g.moveTo(x, 0);
				g.lineTo(x, plot);
				g.stroke();
			}
			if (paint.selection !== null) {
				const from = xAtTime(view, paint.selection.start, width);
				const to = xAtTime(view, paint.selection.end, width);
				g.strokeStyle = colors.selectionEdge;
				g.lineWidth = 1.5;
				g.strokeRect(Math.min(from, to) + .5, .5, Math.abs(to - from), plot - 1);
			}
			g.font = LABEL_FONT;
			g.textBaseline = "top";
			const middle = spec.scale === "mel" ? melToHz((hzToMel(spec.minHz) + hzToMel(spec.maxHz)) / 2) : spec.scale === "log" ? Math.sqrt(Math.max(spec.minHz, 1) * spec.maxHz) : (spec.minHz + spec.maxHz) / 2;
			const labels = [
				{
					hz: spec.maxHz,
					y: 1
				},
				{
					hz: middle,
					y: plot / 2 - 5
				},
				{
					hz: spec.minHz,
					y: plot - 12
				}
			];
			for (const label of labels) {
				const text = formatHz(label.hz);
				const textWidth = g.measureText(text).width;
				g.fillStyle = colors.text;
				g.fillText(text, Math.max(2, width - textWidth - 4), label.y);
			}
			if (paint.playhead !== null) {
				const x = Math.round(xAtTime(view, paint.playhead, width)) + .5;
				g.fillStyle = colors.playhead;
				g.fillRect(x, 0, 1.5, plot);
			}
		}
		//#endregion
		//#region src/client/labels.ts
		const zh = {
			play: "播放",
			pause: "暂停",
			stop: "停止",
			replay: "从头播放",
			mute: "静音",
			unmute: "取消静音",
			volume: "音量",
			rate: "倍速",
			loop: "循环",
			loopOff: "不循环",
			loopAll: "整曲循环",
			loopAb: "选区循环",
			channel: "声道",
			channelMix: "混合",
			channelLeft: "左声道",
			channelRight: "右声道",
			channelN: (index) => "声道 " + String(index + 1),
			view: "视图",
			viewWaveform: "波形",
			viewSpectrogram: "频谱图",
			spectrogramPending: "正在计算频谱图…",
			spectrum: "频谱",
			spectrumBars: "柱状",
			spectrumLine: "折线",
			spectrumWaterfall: "瀑布",
			spectrumOff: "关闭",
			spectrumIdle: "播放后显示实时频谱",
			rms: "RMS",
			zoomIn: "放大",
			zoomOut: "缩小",
			zoomFit: "适配",
			waveform: "波形",
			decode: "解码波形",
			decoding: "解码中",
			decodeFailed: "解码失败：浏览器无法解码该格式",
			tooLong: "文件过长（超过 30 分钟），只做流式播放、不生成波形与频谱图",
			loadFailed: "无法读取音频文件",
			loading: "加载中…",
			selection: "选区",
			clearSelection: "清除选区",
			peak: "峰值",
			rmsReadout: "RMS",
			duration: "时长",
			cursor: "光标",
			peakFreq: "峰值频率",
			audioContextFailed: "Web Audio 不可用，频谱已停用（仍可播放）",
			help: "操作说明",
			helpText: "点击 / 拖动波形：定位\nShift + 拖动：选择区间（选区循环、峰值与 RMS 读数）\nAlt + 拖动：平移　　滚轮：缩放　　双击：适配全曲\n空格：播放 / 暂停　　← / →：±5 秒（Shift 为 ±1 秒）　　Home / End：首尾\n+ / −：缩放　　M：静音　　L：循环模式"
		};
		const en = {
			play: "Play",
			pause: "Pause",
			stop: "Stop",
			replay: "Play from start",
			mute: "Mute",
			unmute: "Unmute",
			volume: "Volume",
			rate: "Speed",
			loop: "Loop",
			loopOff: "No loop",
			loopAll: "Loop file",
			loopAb: "Loop selection",
			channel: "Channel",
			channelMix: "Mix",
			channelLeft: "Left",
			channelRight: "Right",
			channelN: (index) => "Channel " + String(index + 1),
			view: "View",
			viewWaveform: "Waveform",
			viewSpectrogram: "Spectrogram",
			spectrogramPending: "Computing spectrogram…",
			spectrum: "Spectrum",
			spectrumBars: "Bars",
			spectrumLine: "Line",
			spectrumWaterfall: "Waterfall",
			spectrumOff: "Off",
			spectrumIdle: "Live spectrum appears during playback",
			rms: "RMS",
			zoomIn: "Zoom in",
			zoomOut: "Zoom out",
			zoomFit: "Fit",
			waveform: "Waveform",
			decode: "Decode waveform",
			decoding: "Decoding",
			decodeFailed: "Decode failed: the browser cannot decode this format",
			tooLong: "Very long file (over 30 minutes): streaming playback only, no waveform or spectrogram",
			loadFailed: "Cannot read this audio file",
			loading: "Loading…",
			selection: "Selection",
			clearSelection: "Clear selection",
			peak: "Peak",
			rmsReadout: "RMS",
			duration: "Length",
			cursor: "Cursor",
			peakFreq: "Peak",
			audioContextFailed: "Web Audio unavailable — spectrum disabled (playback still works)",
			help: "Controls",
			helpText: "Click / drag the waveform: seek\nShift + drag: select a range (A-B loop, peak and RMS read-out)\nAlt + drag: pan    Wheel: zoom    Double click: fit\nSpace: play/pause    Arrows: ±5 s (Shift: ±1 s)    Home / End: ends\n+ / −: zoom    M: mute    L: loop mode"
		};
		/**
		* Pick the viewer language from a preference list.
		* @param languages - navigator.languages-shaped list (may be undefined).
		* @returns 'zh' when a Chinese variant comes first among the known languages,
		*   otherwise 'en'.
		*/
		function pickLang(languages) {
			for (const entry of languages ?? []) {
				const tag = String(entry).toLowerCase();
				if (tag.startsWith("zh")) return "zh";
				if (tag.startsWith("en")) return "en";
			}
			return "en";
		}
		/**
		* The dictionary for one language.
		* @param lang - the picked language.
		* @returns that language's labels.
		*/
		function labelsFor(lang) {
			return lang === "zh" ? zh : en;
		}
		//#endregion
		//#region src/client/player.ts
		/**
		* The playback engine: one `<audio>` element (so playback streams through the
		* host route's Range responses and seeking stays native) wired into Web Audio
		* for the analyser the spectrum reads. The AudioContext is created lazily on
		* the first play — browsers require a user gesture, and a viewer that is only
		* looked at should not open one.
		*
		* @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/player
		*/
		/** Construct the ambient AudioContext, or null when the platform has none. */
		function defaultAudioContext() {
			const scope = globalThis;
			const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
			if (Ctor === void 0) return null;
			return new Ctor();
		}
		/**
		* Create a player for one URL.
		* @param url - the media URL (the plugin's Range route).
		* @param options - test seams.
		* @returns the player; call {@link Player.dispose} on unmount.
		*/
		function createPlayer(url, options = {}) {
			const element = options.elementFactory?.() ?? new Audio();
			element.src = url;
			element.preload = "metadata";
			let context = null;
			let analyser = null;
			let source = null;
			let bins = null;
			let state = "idle";
			let disposed = false;
			const ensureContext = () => {
				if (disposed) return false;
				if (context !== null) return analyser !== null;
				let created = null;
				try {
					created = options.audioContextFactory?.() ?? defaultAudioContext();
				} catch {
					created = null;
				}
				if (created === null) {
					state = "failed";
					return false;
				}
				context = created;
				try {
					const node = created.createAnalyser();
					node.fftSize = FFT_SIZE;
					node.smoothingTimeConstant = .75;
					const elementSource = created.createMediaElementSource(element);
					elementSource.connect(node);
					node.connect(created.destination);
					analyser = node;
					source = elementSource;
					bins = new Uint8Array(new ArrayBuffer(node.frequencyBinCount));
					state = created.state === "running" ? "running" : "suspended";
					return true;
				} catch {
					analyser = null;
					source = null;
					bins = null;
					state = "failed";
					try {
						context.close();
					} catch {}
					context = null;
					return false;
				}
			};
			return {
				element,
				get analyser() {
					return analyser;
				},
				get contextState() {
					return state;
				},
				ensureContext,
				bins() {
					if (analyser === null || bins === null) return null;
					analyser.getByteFrequencyData(bins);
					return bins;
				},
				async play() {
					if (ensureContext() && context !== null && context.state !== "running") try {
						await context.resume();
						state = context.state === "running" ? "running" : "suspended";
					} catch {
						state = "suspended";
					}
					await element.play();
				},
				pause() {
					try {
						element.pause();
					} catch {}
				},
				dispose() {
					disposed = true;
					try {
						element.pause();
						element.removeAttribute("src");
						element.load();
					} catch {}
					try {
						source?.disconnect();
						analyser?.disconnect();
					} catch {}
					const closing = context;
					context = null;
					analyser = null;
					source = null;
					bins = null;
					if (closing !== null) try {
						closing.close();
					} catch {}
				}
			};
		}
		//#endregion
		//#region src/client/selection.ts
		/**
		* Selection and A-B loop maths: the dragged region's read-out (peak / RMS /
		* length) and the wrap-around arithmetic the loop needs. Pure functions.
		*
		* @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/selection
		*/
		/**
		* Order two drag endpoints into a selection.
		* @param a - first endpoint in seconds.
		* @param b - second endpoint in seconds.
		* @returns the ordered pair.
		*/
		function normalizeSelection(a, b) {
			return a <= b ? {
				start: a,
				end: b
			} : {
				start: b,
				end: a
			};
		}
		/**
		* Read a selection out of the envelopes.
		* @param channels - the channels the user is looking at.
		* @param selection - the dragged range.
		* @param view - current window (maps time to column).
		* @param width - canvas width in CSS pixels.
		* @param columns - envelope column count.
		* @returns the statistics shown next to the selection.
		*/
		function selectionStats(channels, selection, view, width, columns) {
			const span = view.end - view.start;
			const toColumn = (time) => {
				if (span <= 0 || columns <= 0 || width <= 0) return 0;
				return xAtTime(view, time, width) / width * columns;
			};
			const stats = peaksWindowStats(channels, toColumn(selection.start), toColumn(selection.end) - 1);
			const duration = Math.max(0, selection.end - selection.start);
			return {
				start: selection.start,
				end: selection.end,
				duration,
				peak: stats.peak,
				rms: stats.rms,
				peakDb: amplitudeToDb(stats.peak),
				rmsDb: amplitudeToDb(stats.rms)
			};
		}
		/**
		* The loop window an A-B selection defines.
		* @param selection - the dragged range, or null when none exists.
		* @returns the loop window, or null when it is too short to loop.
		*/
		function abRange(selection) {
			if (selection === null) return null;
			return selection.end - selection.start >= .01 ? selection : null;
		}
		//#endregion
		//#region src/client/source.ts
		/**
		* The client side of the plugin's own media route: resolve one file to a
		* playable URL and its facts. The host owns cwd resolution (it reads the
		* session's authoritative cwd), so the request only carries what the viewer
		* knows: the session id, the path as better-sidebar handed it over, and — when
		* the scope happens to carry one — a cwd fallback for the hydration window.
		*
		* @module @huanlin/dsh-plugin-better-sidebar-plugin-audio/client/source
		*/
		/** Route prefix registered by the host half. */
		const ROUTE_PREFIX = "/audio-preview";
		/**
		* Narrow a {@link ViewerData} to its failure branch.
		* @param data - the loaded value.
		* @returns true when loading failed.
		*/
		function isSourceError(data) {
			return typeof data.error === "string";
		}
		/**
		* Build the query string the host route expects.
		* @param params - session, path and optional cwd fallback.
		* @returns an encoded query string.
		*/
		function audioQuery(params) {
			const search = new URLSearchParams();
			search.set("sessionId", params.sessionId);
			search.set("path", params.path);
			if (params.cwd !== void 0 && params.cwd !== "") search.set("cwd", params.cwd);
			return search.toString();
		}
		/**
		* Build one route URL.
		* @param kind - `meta` or `media`.
		* @param params - session, path and optional cwd fallback.
		* @returns the URL to fetch.
		*/
		function buildAudioUrl(kind, params) {
			return `${ROUTE_PREFIX}/${kind}?${audioQuery(params)}`;
		}
		/**
		* Resolve a file to a playable source.
		* @param path - the path better-sidebar opened.
		* @param scope - the session scope (id, and a cwd fallback when present).
		* @param signal - aborts the probe when the viewer unmounts.
		* @returns the source facts, or the failure to display.
		*/
		async function loadAudioSource(path, scope, signal) {
			const params = {
				sessionId: scope.sessionId,
				path,
				cwd: scope.cwd
			};
			try {
				const response = await fetch(buildAudioUrl("meta", params), {
					signal,
					headers: { accept: "application/json" }
				});
				const envelope = await response.json().catch(() => null);
				if (envelope === null || envelope.ok !== true || typeof envelope.value !== "object" || envelope.value === null) return { error: typeof envelope?.error?.message === "string" ? envelope.error.message : `HTTP ${response.status}` };
				const value = envelope.value;
				return {
					url: buildAudioUrl("media", params),
					path: typeof value.path === "string" ? value.path : path,
					name: typeof value.name === "string" ? value.name : path,
					size: typeof value.size === "number" ? value.size : 0,
					mime: typeof value.mime === "string" ? value.mime : "audio/*",
					sessionId: scope.sessionId
				};
			} catch (error) {
				if (error instanceof DOMException && error.name === "AbortError") return { error: "aborted" };
				return { error: error instanceof Error ? error.message : String(error) };
			}
		}
		//#endregion
		//#region src/client/styles.ts
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
		const STYLE_ID = "dsh-audio-preview-styles";
		/** The stylesheet. */
		const VIEWER_CSS = `
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
`;
		/**
		* Inject the stylesheet once.
		* @param doc - target document (defaults to the ambient one).
		*/
		function ensureViewerStyles(doc) {
			const target = doc ?? (typeof document === "undefined" ? void 0 : document);
			if (target === void 0) return;
			if (target.getElementById("dsh-audio-preview-styles") !== null) return;
			const style = target.createElement("style");
			style.id = STYLE_ID;
			style.textContent = VIEWER_CSS;
			target.head.appendChild(style);
		}
		//#endregion
		//#region src/client/theme.ts
		/** Dark-skin fallbacks (used only when a token does not resolve). */
		const DARK_FALLBACK = {
			variant: "dark",
			wave: "rgba(122, 162, 247, 0.95)",
			wavePeak: "rgba(122, 162, 247, 0.28)",
			waveRms: "rgba(122, 162, 247, 0.78)",
			grid: "rgba(170, 182, 204, 0.20)",
			axis: "rgba(170, 182, 204, 0.45)",
			playhead: "#ff9a6c",
			selection: "rgba(122, 162, 247, 0.20)",
			selectionEdge: "rgba(122, 162, 247, 0.80)",
			text: "rgba(219, 226, 240, 0.90)",
			spectrum: "rgba(126, 231, 190, 0.92)",
			spectrumFill: "rgba(126, 231, 190, 0.24)",
			spectrumGrid: "rgba(170, 182, 204, 0.16)",
			accent: "#ffc27a"
		};
		/** Light-skin fallbacks. */
		const LIGHT_FALLBACK = {
			variant: "light",
			wave: "rgba(37, 99, 190, 0.92)",
			wavePeak: "rgba(37, 99, 190, 0.22)",
			waveRms: "rgba(37, 99, 190, 0.82)",
			grid: "rgba(52, 62, 82, 0.20)",
			axis: "rgba(52, 62, 82, 0.45)",
			playhead: "#c2410c",
			selection: "rgba(37, 99, 190, 0.16)",
			selectionEdge: "rgba(37, 99, 190, 0.75)",
			text: "rgba(38, 46, 60, 0.92)",
			spectrum: "rgba(13, 118, 92, 0.95)",
			spectrumFill: "rgba(13, 118, 92, 0.20)",
			spectrumGrid: "rgba(52, 62, 82, 0.14)",
			accent: "#a1560a"
		};
		/** Token -> palette-slot mapping (all read as a colour, so alpha is preserved). */
		const TOKEN_MAP = [
			["wave", "--dsw-alias-brand-primary"],
			["grid", "--dsw-alias-hairline"],
			["axis", "--dsw-alias-border-l2"],
			["playhead", "--dsw-alias-accent"],
			["selection", "--dsw-alias-accent-soft"],
			["selectionEdge", "--dsw-alias-accent"],
			["text", "--dsw-alias-label-secondary"],
			["spectrum", "--dsw-alias-state-success-primary"],
			["spectrumFill", "--dsw-alias-state-success-tertiary"],
			["spectrumGrid", "--dsw-alias-hairline"],
			["accent", "--dsw-alias-state-warn-primary"]
		];
		/**
		* Resolve one CSS custom property to a concrete colour.
		* @param doc - document owning the tokens.
		* @param token - custom property name (--dsw-alias-…).
		* @param scope - element the probe inherits from; the tokens must be read
		*   where the VIEWER lives, not from the document root, because a skin can be
		*   scoped to any ancestor (and two panels can carry different skins at once).
		* @returns the computed colour, or null when the token is missing / invalid.
		*/
		function resolveToken(doc, token, scope) {
			const root = scope ?? doc.body ?? doc.documentElement;
			if (root === null) return null;
			const holder = doc.createElement("div");
			holder.setAttribute("aria-hidden", "true");
			holder.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:0;height:0;color:rgb(1, 2, 3);";
			const probe = doc.createElement("span");
			probe.style.setProperty("color", "var(" + token + ")");
			holder.appendChild(probe);
			root.appendChild(holder);
			let color = "";
			try {
				color = doc.defaultView?.getComputedStyle(probe).color ?? "";
			} catch {
				color = "";
			} finally {
				holder.remove();
			}
			const candidate = color.trim();
			if (candidate === "" || candidate === "rgb(1, 2, 3)" || candidate.startsWith("var(")) return null;
			return candidate;
		}
		/**
		* Perceived brightness of a resolved CSS colour.
		* @param color - a computed rgb() / rgba() string.
		* @returns 0 (black) .. 1 (white), or null when unparsable.
		*/
		function colorLuminance(color) {
			const match = /^rgba?\(([^)]+)\)$/i.exec(color.trim());
			if (match === null) return null;
			const [r, g, b] = (match[1] ?? "").split(/[,\s/]+/).filter((part) => part !== "").slice(0, 3).map(Number);
			if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
			return (.2126 * r + .7152 * g + .0722 * b) / 255;
		}
		/**
		* Re-express an opaque colour at a lower alpha.
		* @param color - a computed rgb() / rgba() colour, or a #rgb / #rrggbb literal.
		* @param alpha - 0..1, clamped.
		* @returns the rgba() string, or null when the colour cannot be parsed.
		*/
		function withAlpha(color, alpha) {
			const value = Math.min(1, Math.max(0, alpha));
			const text = color.trim();
			const functional = /^rgba?\(([^)]+)\)$/i.exec(text);
			if (functional !== null) {
				const [r, g, b] = (functional[1] ?? "").split(/[,\s/]+/).filter((part) => part !== "").slice(0, 3).map(Number);
				if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
				return "rgba(" + String(r) + ", " + String(g) + ", " + String(b) + ", " + String(value) + ")";
			}
			const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
			if (hex === null) return null;
			const body = hex[1] ?? "";
			const full = body.length === 3 ? body.split("").map((part) => part + part).join("") : body;
			const packed = Number.parseInt(full, 16);
			if (!Number.isFinite(packed)) return null;
			return "rgba(" + String(packed >> 16 & 255) + ", " + String(packed >> 8 & 255) + ", " + String(packed & 255) + ", " + String(value) + ")";
		}
		/**
		* Whether the environment asks for a light skin (fallback signal only).
		* @param doc - document to measure.
		* @returns true when the light colour scheme matches.
		*/
		function prefersLight(doc) {
			try {
				return doc.defaultView?.matchMedia("(prefers-color-scheme: light)").matches ?? false;
			} catch {
				return false;
			}
		}
		/**
		* Read the palette for the skin in force where the viewer lives.
		* @param source - the viewer's own container element (preferred), or a
		*   document to read from the root. Defaults to the ambient document.
		* @returns the palette; tokens win, per-variant fallbacks fill the gaps.
		*/
		function readPalette(source) {
			const doc = source instanceof Document ? source : source?.ownerDocument ?? (typeof document === "undefined" ? void 0 : document);
			if (doc === void 0 || (doc.body ?? doc.documentElement) === null) return DARK_FALLBACK;
			const scope = source instanceof Element ? source : null;
			const label = resolveToken(doc, "--dsw-alias-label-primary", scope);
			const luminance = label === null ? null : colorLuminance(label);
			const variant = luminance === null ? prefersLight(doc) ? "light" : "dark" : luminance > .5 ? "dark" : "light";
			const palette = { ...variant === "dark" ? DARK_FALLBACK : LIGHT_FALLBACK };
			for (const [slot, token] of TOKEN_MAP) {
				const resolved = resolveToken(doc, token, scope);
				if (resolved !== null) palette[slot] = resolved;
			}
			palette.variant = variant;
			const peak = withAlpha(palette.wave, variant === "dark" ? .28 : .22);
			if (peak !== null) palette.wavePeak = peak;
			const rms = withAlpha(palette.wave, variant === "dark" ? .78 : .82);
			if (rms !== null) palette.waveRms = rms;
			return palette;
		}
		//#endregion
		//#region src/client/AudioViewer.tsx
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
		/** Time-ruler strip height in CSS pixels (must match the stylesheet). */
		const RULER_HEIGHT = 18;
		/** Live-spectrum lane height in CSS pixels. */
		const SPECTRUM_HEIGHT = 128;
		/** Smallest main-lane height we will paint into. */
		const MIN_LANE_HEIGHT = 90;
		/** Playhead stroke width in CSS pixels. */
		const PLAYHEAD_WIDTH = 2;
		/**
		* Windows up to this many samples re-derive their envelope synchronously in
		* the render (~45 s at 44.1 kHz); anything bigger debounces instead.
		*/
		const SYNC_ENVELOPE_SAMPLES = 2e6;
		/** Playback rates offered in the toolbar. */
		const RATES = [
			.25,
			.5,
			.75,
			1,
			1.25,
			1.5,
			1.75,
			2,
			3
		];
		/**
		* Clamp a number.
		* @param value - candidate.
		* @param min - lower bound.
		* @param max - upper bound.
		* @returns the clamped value.
		*/
		function clamp(value, min, max) {
			if (!Number.isFinite(value)) return min;
			if (max < min) return min;
			return Math.min(Math.max(value, min), max);
		}
		/**
		* Human-readable byte size.
		* @param bytes - size in bytes.
		* @returns e.g. "3.4 MB".
		*/
		function formatBytes(bytes) {
			if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
			const units = [
				"B",
				"KB",
				"MB",
				"GB"
			];
			let value = bytes;
			let unit = 0;
			while (value >= 1024 && unit < units.length - 1) {
				value /= 1024;
				unit += 1;
			}
			return (value >= 10 || unit === 0 ? String(Math.round(value)) : value.toFixed(1)) + " " + (units[unit] ?? "B");
		}
		/** Device pixel ratio of the current window. */
		function devicePixelRatioOf() {
			return typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
		}
		/**
		* Size a canvas for a CSS box and return a context scaled to match.
		* @param canvas - the canvas (may be null before mount).
		* @param cssWidth - CSS width in pixels.
		* @param cssHeight - CSS height in pixels.
		* @param scale - device pixel ratio (clamped to 1..2).
		* @returns the scaled 2D context, or null when unavailable (jsdom).
		*/
		function prepareCanvas(canvas, cssWidth, cssHeight, scale) {
			if (canvas === null) return null;
			const ratio = Math.min(Math.max(scale, 1), 2);
			const pixelWidth = Math.max(1, Math.floor(cssWidth * ratio));
			const pixelHeight = Math.max(1, Math.floor(cssHeight * ratio));
			if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
			if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
			const context = canvas.getContext("2d");
			if (context === null) return null;
			context.setTransform(ratio, 0, 0, ratio, 0, 0);
			return context;
		}
		/**
		* Render the audio viewer.
		* @param props - the loaded source facts.
		* @returns the player pane, or the failure panel.
		*/
		function AudioViewer({ data }) {
			const lang = (0, react.useMemo)(() => pickLang(typeof navigator === "undefined" ? void 0 : navigator.languages), []);
			const t = (0, react.useMemo)(() => labelsFor(lang), [lang]);
			const failed = isSourceError(data);
			const source = failed ? null : data;
			const sourceUrl = source === null ? null : source.url;
			const sourceSize = source === null ? 0 : source.size;
			const containerRef = (0, react.useRef)(null);
			const laneRef = (0, react.useRef)(null);
			const laneCanvasRef = (0, react.useRef)(null);
			const overlayCanvasRef = (0, react.useRef)(null);
			const rulerCanvasRef = (0, react.useRef)(null);
			const spectrumCanvasRef = (0, react.useRef)(null);
			const playerRef = (0, react.useRef)(null);
			const waterfallRef = (0, react.useRef)(null);
			const frameRef = (0, react.useRef)(null);
			const layoutRef = (0, react.useRef)(null);
			const dragRef = (0, react.useRef)(null);
			const decodeAbortRef = (0, react.useRef)(null);
			const decodeStartedRef = (0, react.useRef)(false);
			const lastTimeRef = (0, react.useRef)(0);
			const lastPeakRef = (0, react.useRef)(0);
			const frameSkipRef = (0, react.useRef)(0);
			const hasSpectrumRef = (0, react.useRef)(false);
			const [palette, setPalette] = (0, react.useState)(() => readPalette());
			const [canvasBox, setCanvasBox] = (0, react.useState)({
				width: 600,
				height: 200
			});
			const [mainView, setMainView] = (0, react.useState)("waveform");
			const [heatmap, setHeatmap] = (0, react.useState)({
				image: null,
				spec: null
			});
			/** Envelope re-derived from PCM for the current window (zoom detail). */
			const [waveWindow, setWaveWindow] = (0, react.useState)(null);
			const [ready, setReady] = (0, react.useState)(false);
			const [playing, setPlaying] = (0, react.useState)(false);
			const [time, setTime] = (0, react.useState)(0);
			const [duration, setDuration] = (0, react.useState)(0);
			const [rate, setRate] = (0, react.useState)(1);
			const [volume, setVolume] = (0, react.useState)(1);
			const [muted, setMuted] = (0, react.useState)(false);
			const [loopMode, setLoopMode] = (0, react.useState)("off");
			const [channel, setChannel] = (0, react.useState)("mix");
			const [spectrumStyle, setSpectrumStyle] = (0, react.useState)("bars");
			const [showRms, setShowRms] = (0, react.useState)(true);
			const [decoded, setDecoded] = (0, react.useState)(null);
			const [decodeState, setDecodeState] = (0, react.useState)({
				status: "idle",
				loaded: 0,
				total: 0
			});
			const [view, setView] = (0, react.useState)(() => fullView(0));
			const [selection, setSelection] = (0, react.useState)(null);
			const [cursor, setCursor] = (0, react.useState)(null);
			/** Latest hover time for the overlay loop (a ref: the loop must not restart on every pointer move). */
			const cursorRef = (0, react.useRef)(null);
			const [cursorHz, setCursorHz] = (0, react.useState)(null);
			const [peakHz, setPeakHz] = (0, react.useState)(null);
			const [spectrumLive, setSpectrumLive] = (0, react.useState)(false);
			const [audioFailure, setAudioFailure] = (0, react.useState)(false);
			const [notice, setNotice] = (0, react.useState)(null);
			const envelope = (0, react.useMemo)(() => {
				if (decoded === null) return {
					mix: null,
					per: []
				};
				return {
					mix: mixChannelPeaks(decoded.peaks),
					per: decoded.peaks
				};
			}, [decoded]);
			const activePeaks = channel === "mix" ? envelope.mix : envelope.per[channel] ?? envelope.mix;
			const effectiveView = (0, react.useMemo)(() => duration > 0 ? clampView(view, duration) : view, [duration, view]);
			const loopWindow = abRange(selection);
			(0, react.useEffect)(() => {
				ensureViewerStyles();
			}, []);
			(0, react.useEffect)(() => {
				setPalette(readPalette(containerRef.current));
				if (typeof MutationObserver === "undefined") return;
				const root = document.documentElement;
				if (root === null) return;
				const observer = new MutationObserver(() => setPalette(readPalette(containerRef.current)));
				observer.observe(root, {
					attributes: true,
					attributeFilter: [
						"class",
						"style",
						"data-theme",
						"data-skin"
					]
				});
				return () => observer.disconnect();
			}, []);
			(0, react.useEffect)(() => {
				if (sourceUrl === null) return;
				decodeStartedRef.current = false;
				const player = createPlayer(sourceUrl);
				playerRef.current = player;
				const element = player.element;
				const onMetadata = () => {
					const value = Number.isFinite(element.duration) ? element.duration : 0;
					if (value > 0) {
						setDuration(value);
						setView((current) => current.end <= 0 || current.end > value ? fullView(value) : current);
					}
					setReady(true);
				};
				const onTimeUpdate = () => {
					const current = element.currentTime;
					lastTimeRef.current = current;
					setTime(current);
				};
				const onPlay = () => {
					setPlaying(true);
					player.ensureContext();
					if (player.contextState === "failed") setAudioFailure(true);
				};
				const onPause = () => setPlaying(false);
				const onEnded = () => setPlaying(false);
				const onError = () => setNotice(t.loadFailed);
				element.addEventListener("loadedmetadata", onMetadata);
				element.addEventListener("durationchange", onMetadata);
				element.addEventListener("timeupdate", onTimeUpdate);
				element.addEventListener("play", onPlay);
				element.addEventListener("pause", onPause);
				element.addEventListener("ended", onEnded);
				element.addEventListener("error", onError);
				return () => {
					element.removeEventListener("loadedmetadata", onMetadata);
					element.removeEventListener("durationchange", onMetadata);
					element.removeEventListener("timeupdate", onTimeUpdate);
					element.removeEventListener("play", onPlay);
					element.removeEventListener("pause", onPause);
					element.removeEventListener("ended", onEnded);
					element.removeEventListener("error", onError);
					player.dispose();
					playerRef.current = null;
					setPlaying(false);
					setReady(false);
					setWaveWindow(null);
				};
			}, [sourceUrl, t.loadFailed]);
			(0, react.useEffect)(() => {
				const player = playerRef.current;
				if (player === null) return;
				player.element.loop = loopMode === "all";
				player.element.playbackRate = rate;
				player.element.volume = volume;
				player.element.muted = muted;
			}, [
				loopMode,
				muted,
				rate,
				ready,
				volume
			]);
			const runDecode = (0, react.useCallback)(async () => {
				if (sourceUrl === null) return;
				decodeAbortRef.current?.abort();
				const controller = new AbortController();
				decodeAbortRef.current = controller;
				setDecodeState({
					status: "running",
					loaded: 0,
					total: sourceSize
				});
				try {
					const result = await decodeAudio(await fetchBytes(sourceUrl, {
						signal: controller.signal,
						onProgress: (loaded, total) => setDecodeState((previous) => previous.status === "running" ? {
							status: "running",
							loaded,
							total: total > 0 ? total : previous.total
						} : previous)
					}));
					if (controller.signal.aborted) return;
					setDecoded(result);
					setDecodeState({
						status: "done",
						loaded: 0,
						total: 0
					});
					setDuration((previous) => previous > 0 ? previous : result.duration);
					setView(fullView(result.duration));
					setChannel((current) => current === "mix" || current < result.channels ? current : "mix");
				} catch (error) {
					if (controller.signal.aborted) return;
					setDecodeState({
						status: "failed",
						loaded: 0,
						total: 0,
						error: error instanceof Error ? error.message : String(error)
					});
				}
			}, [sourceSize, sourceUrl]);
			(0, react.useEffect)(() => {
				if (sourceUrl === null) return;
				if (duration <= 0 || decodeStartedRef.current) return;
				decodeStartedRef.current = true;
				if (duration > 1800) {
					setNotice(t.tooLong);
					return;
				}
				runDecode();
				return () => {
					decodeAbortRef.current?.abort();
				};
			}, [
				duration,
				runDecode,
				sourceUrl,
				t.tooLong
			]);
			(0, react.useEffect)(() => {
				const canvas = laneCanvasRef.current;
				if (canvas === null) return;
				const measure = () => setCanvasBox({
					width: Math.max(120, Math.floor(canvas.clientWidth || 0)),
					height: Math.max(MIN_LANE_HEIGHT, Math.floor(canvas.clientHeight || 0))
				});
				measure();
				if (typeof ResizeObserver === "undefined") {
					window.addEventListener("resize", measure);
					return () => window.removeEventListener("resize", measure);
				}
				const observer = new ResizeObserver(measure);
				observer.observe(canvas);
				return () => observer.disconnect();
			}, [mainView]);
			(0, react.useEffect)(() => {
				const mono = decoded?.mono;
				const sampleRate = decoded?.sampleRate ?? 0;
				if (mainView !== "spectrogram" || mono === void 0 || mono.length === 0 || sampleRate <= 0) return;
				const ratio = Math.min(2, Math.max(1, devicePixelRatioOf()));
				const columns = Math.max(64, Math.round(canvasBox.width * ratio));
				const bands = Math.max(128, Math.min(512, Math.round(canvasBox.height * ratio)));
				const timer = setTimeout(() => {
					const spec = computeSpectrogramWindow(mono, sampleRate, {
						startTime: effectiveView.start,
						endTime: effectiveView.end,
						columns,
						bands,
						scale: "mel"
					});
					const canvas = document.createElement("canvas");
					canvas.width = spec.columns;
					canvas.height = spec.bands;
					const context = canvas.getContext("2d");
					if (context === null) return;
					const frame = context.createImageData(spec.columns, spec.bands);
					renderSpectrogramRgba(spec, frame.data, palette.variant);
					context.putImageData(frame, 0, 0);
					setHeatmap({
						image: canvas,
						spec
					});
				}, 120);
				return () => clearTimeout(timer);
			}, [
				canvasBox.height,
				canvasBox.width,
				decoded,
				effectiveView,
				mainView,
				palette.variant
			]);
			const syncWindowPeaks = (0, react.useMemo)(() => {
				const mono = decoded?.mono;
				const sampleRate = decoded?.sampleRate ?? 0;
				if (channel !== "mix" || decoded === null || decoded.duration <= 0 || mono === void 0 || mono.length === 0 || sampleRate <= 0) return null;
				const total = Math.max(decoded.duration, duration);
				const span = effectiveView.end - effectiveView.start;
				if (span >= total - 1e-6) return null;
				const ratio = Math.min(2, Math.max(1, devicePixelRatioOf()));
				const targetColumns = Math.max(200, Math.round(canvasBox.width * ratio));
				if (decoded.columns * (span / decoded.duration) >= targetColumns - 2) return null;
				if (span * sampleRate > SYNC_ENVELOPE_SAMPLES) return null;
				const from = Math.max(0, Math.floor(effectiveView.start * sampleRate));
				const to = Math.min(mono.length, Math.ceil(effectiveView.end * sampleRate));
				if (to - from < 2) return null;
				return computeChannelPeaks(mono.subarray(from, to), targetColumns);
			}, [
				canvasBox.width,
				channel,
				decoded,
				duration,
				effectiveView
			]);
			(0, react.useEffect)(() => {
				if (syncWindowPeaks !== null || decoded === null || decoded.duration <= 0) return;
				const mono = decoded.mono;
				const sampleRate = decoded.sampleRate;
				if (mono === void 0 || mono.length === 0 || sampleRate <= 0 || channel !== "mix") return;
				const total = Math.max(decoded.duration, duration);
				const span = effectiveView.end - effectiveView.start;
				if (span >= total - 1e-6) return;
				const ratio = Math.min(2, Math.max(1, devicePixelRatioOf()));
				const targetColumns = Math.max(200, Math.round(canvasBox.width * ratio));
				if (decoded.columns * (span / decoded.duration) >= targetColumns - 2) return;
				if (span * sampleRate <= SYNC_ENVELOPE_SAMPLES) return;
				const timer = setTimeout(() => {
					const from = Math.max(0, Math.floor(effectiveView.start * sampleRate));
					const to = Math.min(mono.length, Math.ceil(effectiveView.end * sampleRate));
					if (to - from < 2) return;
					setWaveWindow({
						peaks: computeChannelPeaks(mono.subarray(from, to), targetColumns),
						start: effectiveView.start,
						end: effectiveView.end
					});
				}, 120);
				return () => clearTimeout(timer);
			}, [
				canvasBox.width,
				channel,
				decoded,
				duration,
				effectiveView,
				syncWindowPeaks
			]);
			(0, react.useEffect)(() => {
				const { width, height } = canvasBox;
				const context = prepareCanvas(laneCanvasRef.current, width, height, devicePixelRatioOf());
				if (context === null) return;
				if (mainView === "spectrogram") {
					const spec = heatmap.spec;
					drawSpectrogramFrame(context, {
						width,
						height,
						image: spec === null ? null : heatmap.image,
						spec: spec === null ? {
							columns: 0,
							bands: 0,
							startTime: 0,
							endTime: 0,
							minHz: 0,
							maxHz: 0,
							scale: "mel"
						} : {
							columns: spec.columns,
							bands: spec.bands,
							startTime: spec.startTime,
							endTime: spec.endTime,
							minHz: spec.minHz,
							maxHz: spec.maxHz,
							scale: spec.scale
						},
						view: effectiveView,
						playhead: null,
						selection,
						colors: palette
					});
					return;
				}
				const matchedWindow = waveWindow !== null && waveWindow.start === effectiveView.start && waveWindow.end === effectiveView.end ? waveWindow : null;
				const windowPeaks = syncWindowPeaks !== null ? {
					peaks: syncWindowPeaks,
					start: effectiveView.start,
					end: effectiveView.end
				} : matchedWindow;
				const paintPeaks = windowPeaks !== null ? windowPeaks.peaks : activePeaks;
				if (paintPeaks === null) {
					context.clearRect(0, 0, width, height);
					return;
				}
				drawWaveform(context, {
					width,
					height,
					view: effectiveView,
					duration: windowPeaks !== null ? windowPeaks.end - windowPeaks.start : decoded?.duration ?? 0,
					peaksStart: windowPeaks !== null ? windowPeaks.start : 0,
					peaks: paintPeaks,
					showRms,
					playhead: null,
					selection,
					colors: palette
				});
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
				syncWindowPeaks
			]);
			(0, react.useEffect)(() => {
				const context = prepareCanvas(rulerCanvasRef.current, canvasBox.width, RULER_HEIGHT, devicePixelRatioOf());
				if (context === null) return;
				drawTimeRuler(context, {
					width: canvasBox.width,
					height: RULER_HEIGHT,
					view: effectiveView,
					colors: palette
				});
			}, [
				canvasBox.width,
				palette,
				effectiveView
			]);
			(0, react.useEffect)(() => {
				cursorRef.current = cursor;
			}, [cursor]);
			(0, react.useEffect)(() => {
				if (typeof requestAnimationFrame !== "function") return;
				let frame = 0;
				let stopped = false;
				const draw = () => {
					if (stopped) return;
					frame = requestAnimationFrame(draw);
					const { width, height } = canvasBox;
					if (width <= 0 || height <= 0) return;
					const g = prepareCanvas(overlayCanvasRef.current, width, height, devicePixelRatioOf());
					if (g === null) return;
					g.clearRect(0, 0, width, height);
					const player = playerRef.current;
					if (player !== null && duration > 0) {
						const current = player.element.currentTime;
						if (Number.isFinite(current)) {
							const x = clamp(Math.round(xAtTime(effectiveView, current, width)), 0, Math.max(0, width - PLAYHEAD_WIDTH));
							g.fillStyle = palette.playhead;
							g.fillRect(x, 0, PLAYHEAD_WIDTH, height);
						}
					}
					const hover = cursorRef.current;
					if (hover !== null) {
						g.strokeStyle = palette.axis;
						g.lineWidth = 1;
						const x = clamp(Math.round(xAtTime(effectiveView, hover, width)), 0, Math.max(0, width - 1)) + .5;
						g.beginPath();
						g.moveTo(x, 0);
						g.lineTo(x, height);
						g.stroke();
					}
				};
				frame = requestAnimationFrame(draw);
				return () => {
					stopped = true;
					cancelAnimationFrame(frame);
				};
			}, [
				canvasBox,
				duration,
				effectiveView,
				palette
			]);
			const paintSpectrum = (0, react.useCallback)((player) => {
				const canvas = spectrumCanvasRef.current;
				if (canvas === null) return;
				const columns = Math.max(1, Math.floor(canvas.clientWidth || canvasBox.width));
				const rows = Math.max(40, Math.floor(canvas.clientHeight || SPECTRUM_HEIGHT));
				if (canvas.width !== columns || canvas.height !== rows) {
					canvas.width = columns;
					canvas.height = rows;
					layoutRef.current = null;
					waterfallRef.current = null;
					frameRef.current = null;
				}
				const context = canvas.getContext("2d");
				if (context === null) return;
				const bins = player.bins();
				const analyser = player.analyser;
				if (bins === null || analyser === null) {
					if (player.contextState === "failed") setAudioFailure(true);
					return;
				}
				const sampleRate = analyser.context.sampleRate;
				let layout = layoutRef.current;
				if (layout === null || layout.sampleRate !== sampleRate || layout.columns !== columns) {
					layout = spectrumLayout(columns, sampleRate, { fftSize: FFT_SIZE });
					layoutRef.current = layout;
				}
				const values = collapseSpectrum(bins, layout);
				if (!hasSpectrumRef.current) {
					for (let index = 0; index < values.length; index++) if ((values[index] ?? 0) > .01) {
						hasSpectrumRef.current = true;
						setSpectrumLive(true);
						break;
					}
				}
				const now = typeof performance === "undefined" ? Date.now() : performance.now();
				if (now - lastPeakRef.current > 250) {
					lastPeakRef.current = now;
					const hz = peakFrequency(bins, sampleRate, FFT_SIZE);
					setPeakHz(hz > 0 ? hz : null);
				}
				if (spectrumStyle === "waterfall") {
					let buffer = waterfallRef.current;
					if (buffer === null || buffer.width !== columns) {
						buffer = new WaterfallBuffer(columns, rows);
						waterfallRef.current = buffer;
						frameRef.current = null;
					}
					buffer.push(values);
					let frame = frameRef.current;
					if (frame === null || frame.width !== columns) {
						frame = context.createImageData(columns, rows);
						frameRef.current = frame;
					}
					buffer.render(frame.data, palette.variant);
					drawWaterfallFrame(context, frame);
					return;
				}
				drawSpectrum(context, {
					width: columns,
					height: rows,
					values,
					style: spectrumStyle === "line" ? "line" : "bars",
					layout,
					peakHz,
					cursorHz,
					colors: palette
				});
			}, [
				canvasBox.width,
				cursorHz,
				palette,
				peakHz,
				spectrumStyle
			]);
			(0, react.useEffect)(() => {
				if (sourceUrl === null) return;
				if (spectrumStyle === "off") return;
				if (typeof requestAnimationFrame !== "function") return;
				let frame = 0;
				let stopped = false;
				const tick = () => {
					if (stopped) return;
					frame = requestAnimationFrame(tick);
					const player = playerRef.current;
					if (player === null) return;
					const element = player.element;
					const current = element.currentTime;
					if (Math.abs(current - lastTimeRef.current) > .04) {
						lastTimeRef.current = current;
						setTime(current);
					}
					if (loopMode === "ab" && loopWindow !== null && !element.paused && current >= loopWindow.end - .02) {
						element.currentTime = loopWindow.start;
						lastTimeRef.current = loopWindow.start;
						setTime(loopWindow.start);
					}
					frameSkipRef.current = (frameSkipRef.current + 1) % (element.paused ? 8 : 1);
					if (frameSkipRef.current !== 0) return;
					paintSpectrum(player);
				};
				frame = requestAnimationFrame(tick);
				return () => {
					stopped = true;
					cancelAnimationFrame(frame);
				};
			}, [
				loopMode,
				loopWindow,
				paintSpectrum,
				sourceUrl,
				spectrumStyle
			]);
			const seekTo = (0, react.useCallback)((seconds) => {
				const player = playerRef.current;
				if (player === null) return;
				const total = duration > 0 ? duration : player.element.duration;
				const target = clamp(seconds, 0, Number.isFinite(total) ? total : seconds);
				try {
					player.element.currentTime = target;
				} catch {}
				lastTimeRef.current = target;
				setTime(target);
			}, [duration]);
			const togglePlay = (0, react.useCallback)(() => {
				const player = playerRef.current;
				if (player === null) return;
				if (player.element.paused) player.play().catch((error) => {
					setNotice(error instanceof Error ? error.message : String(error));
				});
				else player.pause();
			}, []);
			const stop = (0, react.useCallback)(() => {
				playerRef.current?.pause();
				seekTo(0);
			}, [seekTo]);
			const zoomBy = (0, react.useCallback)((factor) => {
				setView((current) => {
					const bounds = duration > 0 ? duration : current.end;
					return zoomView(clampView(current, bounds), time, factor, bounds);
				});
			}, [duration, time]);
			const fit = (0, react.useCallback)(() => setView(fullView(duration)), [duration]);
			const pointerTime = (0, react.useCallback)((clientX) => {
				const area = laneRef.current;
				if (area === null) return 0;
				const rect = area.getBoundingClientRect();
				const upper = duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
				return clamp(timeAtX(effectiveView, clientX - rect.left, canvasBox.width), 0, upper);
			}, [
				canvasBox.width,
				duration,
				effectiveView
			]);
			const onPointerDown = (0, react.useCallback)((event) => {
				event.preventDefault();
				const at = pointerTime(event.clientX);
				try {
					event.currentTarget.setPointerCapture(event.pointerId);
				} catch {}
				if (event.altKey || event.button === 1) {
					dragRef.current = {
						mode: "pan",
						startX: event.clientX,
						startTime: at,
						startView: effectiveView
					};
					return;
				}
				if (event.shiftKey) {
					dragRef.current = {
						mode: "select",
						startX: event.clientX,
						startTime: at,
						startView: effectiveView
					};
					setSelection({
						start: at,
						end: at
					});
					return;
				}
				dragRef.current = {
					mode: "seek",
					startX: event.clientX,
					startTime: at,
					startView: effectiveView
				};
				seekTo(at);
			}, [
				effectiveView,
				pointerTime,
				seekTo
			]);
			const onPointerMove = (0, react.useCallback)((event) => {
				const at = pointerTime(event.clientX);
				setCursor(at);
				const drag = dragRef.current;
				if (drag === null) return;
				if (drag.mode === "seek") {
					seekTo(at);
					return;
				}
				if (drag.mode === "select") {
					setSelection(normalizeSelection(drag.startTime, at));
					return;
				}
				const span = drag.startView.end - drag.startView.start;
				const delta = (event.clientX - drag.startX) / Math.max(1, canvasBox.width) * span;
				setView(clampView({
					start: drag.startView.start - delta,
					end: drag.startView.end - delta
				}, duration > 0 ? duration : span));
			}, [
				canvasBox.width,
				duration,
				pointerTime,
				seekTo
			]);
			const onPointerUp = (0, react.useCallback)(() => {
				dragRef.current = null;
			}, []);
			const onDoubleClick = (0, react.useCallback)(() => {
				setView(fullView(duration));
			}, [duration]);
			const onKeyDown = (0, react.useCallback)((event) => {
				const step = event.shiftKey ? 1 : 5;
				switch (event.key) {
					case " ":
					case "Spacebar":
						event.preventDefault();
						togglePlay();
						return;
					case "ArrowLeft":
						event.preventDefault();
						seekTo(time - step);
						return;
					case "ArrowRight":
						event.preventDefault();
						seekTo(time + step);
						return;
					case "Home":
						event.preventDefault();
						seekTo(0);
						return;
					case "End":
						event.preventDefault();
						seekTo(duration);
						return;
					case "+":
					case "=":
						event.preventDefault();
						zoomBy(.8);
						return;
					case "-":
					case "_":
						event.preventDefault();
						zoomBy(1.25);
						return;
					case "m":
					case "M":
						setMuted((current) => !current);
						return;
					case "l":
					case "L":
						setLoopMode((current) => current === "off" ? "all" : current === "all" ? "ab" : "off");
						return;
					default: return;
				}
			}, [
				duration,
				seekTo,
				time,
				togglePlay,
				zoomBy
			]);
			(0, react.useEffect)(() => {
				const element = laneRef.current;
				if (element === null) return;
				const onWheel = (event) => {
					if (event.deltaY === 0) return;
					event.preventDefault();
					const rect = element.getBoundingClientRect();
					const focus = clamp(timeAtX(effectiveView, event.clientX - rect.left, canvasBox.width), 0, duration > 0 ? duration : 0);
					const factor = event.deltaY > 0 ? 1.25 : .8;
					setView((current) => {
						const bounds = duration > 0 ? duration : current.end;
						return zoomView(clampView(current, bounds), focus, factor, bounds);
					});
				};
				element.addEventListener("wheel", onWheel, { passive: false });
				return () => element.removeEventListener("wheel", onWheel);
			}, [
				canvasBox.width,
				duration,
				effectiveView
			]);
			const stats = (0, react.useMemo)(() => {
				if (selection === null || decoded === null || activePeaks === null) return null;
				return selectionStats(channel === "mix" ? envelope.per : [activePeaks], selection, effectiveView, canvasBox.width, decoded.columns);
			}, [
				activePeaks,
				canvasBox.width,
				channel,
				decoded,
				effectiveView,
				envelope.per,
				selection
			]);
			const decodeProgress = decodeState.status === "running" && decodeState.total > 0 ? Math.round(decodeState.loaded / decodeState.total * 100) : null;
			const readout = (0, react.useMemo)(() => {
				const parts = [];
				parts.push(t.cursor + " " + (cursor === null ? "—" : formatTime(cursor, true)));
				if (cursorHz !== null) parts.push(formatHz(cursorHz));
				if (peakHz !== null) parts.push(t.peakFreq + " " + formatHz(peakHz));
				if (stats !== null) parts.push(t.selection + " " + formatTime(stats.duration, true) + " · " + t.peak + " " + stats.peakDb.toFixed(1) + " dB · " + t.rmsReadout + " " + stats.rmsDb.toFixed(1) + " dB");
				if (ready === false) parts.unshift(t.loading);
				return parts.join(" · ");
			}, [
				cursor,
				cursorHz,
				peakHz,
				ready,
				stats,
				t
			]);
			if (failed) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsh-audio",
				"data-dsh-audio-preview": "error",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-audio__error",
					children: t.loadFailed + ": " + data.error
				})
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-audio",
				ref: containerRef,
				tabIndex: 0,
				onKeyDown,
				"data-dsh-audio-preview": "viewer",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-audio__title",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-audio__name",
							title: source?.path ?? "",
							children: source?.name ?? ""
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-audio__meta",
							children: formatBytes(sourceSize) + (decoded === null ? "" : " · " + (decoded.sampleRate / 1e3).toFixed(1) + " kHz · " + (decoded.channels === 1 ? "mono" : String(decoded.channels) + " ch"))
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-audio__bar",
						role: "toolbar",
						"aria-label": t.waveform,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dsh-audio__group",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: togglePlay,
										"aria-label": playing ? t.pause : t.play,
										title: playing ? t.pause : t.play,
										children: playing ? "❙❙" : "▶"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: stop,
										"aria-label": t.stop,
										title: t.stop,
										children: "■"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => seekTo(0),
										"aria-label": t.replay,
										title: t.replay,
										children: "⏮"
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-audio__time",
								children: formatTime(time, true) + " / " + formatTime(duration)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dsh-audio__group",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-audio__label",
									children: t.view
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									"aria-label": t.view,
									value: mainView,
									onChange: (event) => setMainView(event.target.value),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "waveform",
										children: t.viewWaveform
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "spectrogram",
										children: t.viewSpectrogram
									})]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dsh-audio__group",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-audio__label",
									children: t.rate
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
									"aria-label": t.rate,
									value: String(rate),
									onChange: (event) => setRate(Number(event.target.value)),
									children: RATES.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: String(value),
										children: String(value) + "×"
									}, value))
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dsh-audio__group",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-audio__label",
									children: t.loop
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									"aria-label": t.loop,
									value: loopMode,
									onChange: (event) => setLoopMode(event.target.value),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "off",
											children: t.loopOff
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "all",
											children: t.loopAll
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "ab",
											disabled: loopWindow === null,
											children: t.loopAb
										})
									]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dsh-audio__group",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"data-active": muted,
									onClick: () => setMuted((current) => !current),
									"aria-label": muted ? t.unmute : t.mute,
									title: muted ? t.unmute : t.mute,
									children: muted ? "🔇" : "🔊"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "range",
									min: 0,
									max: 1,
									step: .01,
									value: volume,
									"aria-label": t.volume,
									onChange: (event) => setVolume(Number(event.target.value))
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dsh-audio__group",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-audio__label",
									children: t.channel
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									"aria-label": t.channel,
									value: channel === "mix" ? "mix" : String(channel),
									onChange: (event) => setChannel(event.target.value === "mix" ? "mix" : Number(event.target.value)),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "mix",
										children: t.channelMix
									}), Array.from({ length: decoded?.channels ?? 0 }, (_value, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: String(index),
										children: decoded !== null && decoded.channels === 2 ? index === 0 ? t.channelLeft : t.channelRight : t.channelN(index)
									}, index))]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dsh-audio__group",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										"data-active": showRms,
										onClick: () => setShowRms((current) => !current),
										title: t.rms,
										children: t.rms
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => zoomBy(.8),
										"aria-label": t.zoomIn,
										title: t.zoomIn,
										children: "＋"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => zoomBy(1.25),
										"aria-label": t.zoomOut,
										title: t.zoomOut,
										children: "－"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: fit,
										"aria-label": t.zoomFit,
										title: t.zoomFit,
										children: "⤢"
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dsh-audio__group",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-audio__label",
									children: t.spectrum
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									"aria-label": t.spectrum,
									value: spectrumStyle,
									onChange: (event) => setSpectrumStyle(event.target.value),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "bars",
											children: t.spectrumBars
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "line",
											children: t.spectrumLine
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "waterfall",
											children: t.spectrumWaterfall
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "off",
											children: t.spectrumOff
										})
									]
								})]
							}),
							selection !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dsh-audio__group dsh-audio__selection",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t.selection }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-audio__selection-value",
									onClick: () => setSelection(null),
									"aria-label": t.clearSelection,
									title: t.clearSelection,
									children: "✕"
								})]
							}) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-audio__notices",
						children: [
							notice !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-audio__notice",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: notice }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => setNotice(null),
									"aria-label": t.clearSelection,
									children: "✕"
								})]
							}) : null,
							decodeState.status === "failed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-audio__notice",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t.decodeFailed + (decodeState.error === void 0 ? "" : " — " + decodeState.error) })
							}) : null,
							audioFailure ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-audio__notice",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t.audioContextFailed })
							}) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-audio__lane",
						ref: laneRef,
						"data-view": effectiveView.start.toFixed(3) + "-" + effectiveView.end.toFixed(3),
						onPointerDown,
						onPointerMove,
						onPointerUp,
						onPointerLeave: () => {
							setCursor(null);
							dragRef.current = null;
						},
						onDoubleClick,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("canvas", { ref: laneCanvasRef }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("canvas", {
								ref: overlayCanvasRef,
								className: "dsh-audio__lane-overlay"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-audio__ruler",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("canvas", { ref: rulerCanvasRef })
							}),
							mainView === "spectrogram" && heatmap.spec === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-audio__lane-empty",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: decodeState.status === "running" ? t.decoding + "…" + (decodeProgress === null ? "" : " " + String(decodeProgress) + "%") : t.spectrogramPending })
							}) : null
						]
					}),
					spectrumStyle === "off" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-audio__spectrum",
						children: [spectrumLive ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-audio__spectrum-empty",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t.spectrumIdle })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("canvas", {
							ref: spectrumCanvasRef,
							onPointerMove: (event) => {
								const rect = event.currentTarget.getBoundingClientRect();
								const canvas = spectrumCanvasRef.current;
								const layout = layoutRef.current;
								if (canvas === null || layout === null) return;
								setCursorHz(frequencyAtX(event.clientX - rect.left, layout, canvas.width));
							},
							onPointerLeave: () => setCursorHz(null)
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-audio__hint",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-audio__hint-readout",
							title: readout,
							children: readout
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-audio__hint-help",
							"aria-label": t.help,
							title: t.helpText,
							children: "?"
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/index.tsx
		/** The file viewer id (unique across the sidebar's registry). */
		const VIEWER_ID = "dsh-audio-preview:audio";
		/** Priority: above the built-in markdown/html (0) and `code` catch-all (-100). */
		const VIEWER_PRIORITY = 50;
		/**
		* Services required before mounting: the sidebar's registry service. When
		* better-sidebar is absent the plugin simply never activates (it is an
		* optional peer), which is the documented opt-in contract.
		*/
		const inject = ["betterSidebar"];
		/** Plugin identity for loader diagnostics. */
		const name = "dsh-plugin-better-sidebar-plugin-audio";
		/** Viewer name shown in the sidebar's settings list. */
		function viewerTitle() {
			return pickLang(typeof navigator === "undefined" ? void 0 : navigator.languages) === "zh" ? "音频预览" : "Audio preview";
		}
		/** Small speaker glyph (drawn with `currentColor`, so it follows the skin). */
		function AudioIcon(size) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				"aria-hidden": "true",
				focusable: "false",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M8.5 2.2 5 5.2H2.8v5.6H5l3.5 3V2.2Z",
					fill: "currentColor"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M10.6 5.4a3.4 3.4 0 0 1 0 5.2M12.4 3.4a6 6 0 0 1 0 9.2",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "1.2",
					strokeLinecap: "round"
				})]
			});
		}
		/**
		* Register the audio file viewer.
		* @param ctx - the client plugin context (better-sidebar ready per {@link inject}).
		*/
		function apply(ctx) {
			const betterSidebar = ctx.betterSidebar;
			if (betterSidebar === void 0) return;
			ensureViewerStyles();
			ctx.effect(() => betterSidebar.registerFileViewer({
				id: VIEWER_ID,
				title: viewerTitle,
				icon: (size) => AudioIcon(size),
				exts: AUDIO_EXTS,
				priority: 50,
				fetchStrategy: "custom",
				load: (path, scope, signal) => loadAudioSource(path, {
					sessionId: scope.sessionId,
					cwd: scope.cwd
				}, signal),
				component: (props) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AudioViewer, { data: props.customData })
			}), "dsh-audio-preview: file viewer");
		}
		//#endregion
		exports.VIEWER_ID = VIEWER_ID;
		exports.VIEWER_PRIORITY = VIEWER_PRIORITY;
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map