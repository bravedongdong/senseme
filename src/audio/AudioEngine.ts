import type { Track } from '../types';

export interface AudioEngineState {
  playing: boolean;
  playbackRequested: boolean;
  loading: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  preview: boolean;
}

type AudioContextConstructor = new () => AudioContext;

interface TrackUrlResponse {
  url?: unknown;
  preview?: unknown;
  notice?: unknown;
  error?: unknown;
  message?: unknown;
  detail?: unknown;
}

const TRACK_URL_TIMEOUT_MS = 15_000;

const AUDIO_ERROR_MESSAGES: Record<number, string> = {
  1: '音频加载已取消。',
  2: '音频网络加载失败：远程地址可能已失效，或服务器拒绝了跨域访问（CORS）。',
  3: '音频解码失败：文件可能损坏或格式不受支持。',
  4: '音频格式或地址不受支持：请检查远程服务器的 CORS 和 Content-Type 设置。',
};

/**
 * Small media-element based playback engine used by the SensMe UI.
 *
 * The Web Audio graph is deliberately created lazily from play(). Creating
 * AudioContext in a constructor is rejected by some browsers before the first
 * user gesture, while play() is normally called from a click/tap handler.
 */
export class AudioEngine extends EventTarget {
  public readonly audio: HTMLAudioElement;

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private frequencyData: Uint8Array<ArrayBuffer> | null = null;
  private analysisUnavailable = false;
  private analysisNoticeSent = false;

  private currentTrack: Track | null = null;
  private loading = false;
  private playing = false;
  private playbackRequested = false;
  private playRevision = 0;
  private currentTime = 0;
  private duration = 0;
  private volume = 1;
  private preview = false;
  private sourceReady = false;
  private loadToken = 0;
  private pendingAbort: AbortController | null = null;
  private cancelPendingReady: (() => void) | null = null;
  private readyWaitActive = false;
  private disposed = false;

  private readonly onLoadStart = (): void => {
    if (this.disposed) return;
    this.loading = true;
    this.emitState();
  };

  private readonly onLoadedMetadata = (): void => {
    if (this.disposed) return;
    this.updateDurationFromAudio();
    this.updateTimeFromAudio();
    this.emitState();
  };

  private readonly onDurationChange = (): void => {
    if (this.disposed) return;
    this.updateDurationFromAudio();
    this.emitState();
  };

  private readonly onTimeUpdate = (): void => {
    if (this.disposed) return;
    this.updateTimeFromAudio();
    this.emitState();
  };

  private readonly onWaiting = (): void => {
    if (this.disposed) return;
    this.loading = true;
    this.emitState();
  };

  private readonly onCanPlay = (): void => {
    if (this.disposed) return;
    this.loading = false;
    this.updateDurationFromAudio();
    this.emitState();
  };

  private readonly onPlaying = (): void => {
    if (this.disposed) return;
    if (!this.playbackRequested) { this.audio.pause(); return; }
    this.loading = false;
    this.playing = true;
    this.updateTimeFromAudio();
    this.emitState();
  };

  private readonly onPause = (): void => {
    if (this.disposed) return;
    this.playing = false;
    this.updateTimeFromAudio();
    this.emitState();
  };

  private readonly onEnded = (): void => {
    if (this.disposed) return;
    this.playing = false;
    this.playbackRequested = false;
    this.loading = false;
    this.updateDurationFromAudio();
    this.updateTimeFromAudio();
    if (this.duration > 0) this.currentTime = this.duration;
    this.emitState();
    this.dispatchEvent(new Event('ended'));
  };

  private readonly onMediaError = (): void => {
    if (this.disposed || this.readyWaitActive) return;
    this.loading = false;
    this.playing = false;
    this.playbackRequested = false;
    this.emitState();
    this.reportError(this.mediaErrorMessage());
  };

  constructor() {
    super();

    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.crossOrigin = 'anonymous';
    this.audio.volume = this.volume;

    this.audio.addEventListener('loadstart', this.onLoadStart);
    this.audio.addEventListener('loadedmetadata', this.onLoadedMetadata);
    this.audio.addEventListener('durationchange', this.onDurationChange);
    this.audio.addEventListener('timeupdate', this.onTimeUpdate);
    this.audio.addEventListener('waiting', this.onWaiting);
    this.audio.addEventListener('canplay', this.onCanPlay);
    this.audio.addEventListener('playing', this.onPlaying);
    this.audio.addEventListener('pause', this.onPause);
    this.audio.addEventListener('ended', this.onEnded);
    this.audio.addEventListener('error', this.onMediaError);

    this.emitState();
  }

  /**
   * Resolve a track URL, load it into the media element, and optionally start
   * playback. A superseded load resolves quietly once its token is stale; it
   * must never overwrite the newer track or report an abort as a user error.
   */
  public async load(track: Track, autoplay = true): Promise<void> {
    this.assertUsable();

    const token = ++this.loadToken;
    this.cancelPendingReady?.();
    this.cancelPendingReady = null;
    this.pendingAbort?.abort();
    this.pendingAbort = null;

    this.playRevision++;
    this.playbackRequested = autoplay;
    this.audio.pause();
    this.currentTrack = track;
    this.loading = true;
    this.playing = false;
    this.sourceReady = false;
    this.currentTime = 0;
    this.duration = this.finiteNonNegative(track.duration) ?? 0;
    this.preview = track.preview === true;
    this.emitState();

    const controller = new AbortController();
    this.pendingAbort = controller;

    try {
      let url = typeof track.url === 'string' ? track.url.trim() : '';
      let preview = this.preview;

      if (!url) {
        const endpoint = `/api/track/${encodeURIComponent(track.id)}/url?provider=${encodeURIComponent(track.source)}`;
        let response: Response;
        try {
          const timeout = setTimeout(() => controller.abort(), 15000);
          try { response = await fetch(endpoint, { signal: controller.signal }); }
          finally { clearTimeout(timeout); }
        } catch (error) {
          if (!this.isCurrentToken(token)) return;
          if (this.isAbortError(error)) throw new Error('获取音频地址超时，请重试或切换音源。');
          throw new Error('无法获取音频地址：网络错误或服务端未开启。');
        }

        if (!this.isCurrentToken(token)) return;
        if (!response.ok) {
          const failed = await response.json().catch(() => null);
          if (failed?.error?.code === 'track_unavailable') throw new Error('该歌曲暂无公开可播放音源，请选择其他歌曲。');
          throw new Error(failed?.error?.message || `无法获取音频地址：服务器返回 ${response.status}。`);
        }

        let payload: TrackUrlResponse;
        try {
          payload = (await response.json()) as TrackUrlResponse;
        } catch {
          throw new Error('无法获取音频地址：服务器返回的数据格式无效。');
        }

        if (!this.isCurrentToken(token)) return;

        if (typeof payload.notice === 'string' && payload.notice.trim()) {
          this.reportNotice(payload.notice.trim());
        }
        if (typeof payload.url !== 'string' || !payload.url.trim()) {
          throw new Error('无法获取音频地址：服务器没有返回可播放的 URL。');
        }

        url = payload.url.trim();
        if (typeof payload.preview === 'boolean') preview = payload.preview;
      }

      if (!this.isCurrentToken(token)) return;

      this.preview = preview;
      this.loading = true;
      this.sourceReady = true;
      this.audio.src = url;
      // Install the listeners before calling load(): lightweight test media
      // elements and a few browsers can emit loadstart synchronously.
      const readyPromise = this.waitForReady(token);
      this.audio.load();
      const ready = await readyPromise;
      if (!ready || !this.isCurrentToken(token)) return;

      this.loading = false;
      this.updateDurationFromAudio();
      this.updateTimeFromAudio();
      this.emitState();

      if (this.playbackRequested && this.isCurrentToken(token)) {
        await this.playInternal(token);
      }
    } catch (error) {
      if (!this.isCurrentToken(token)) return;

      this.loading = false;
      this.playing = false;
      this.sourceReady = false;
      this.playbackRequested = false;
      this.emitState();

      const message = this.errorMessage(error, '音频加载失败');
      this.reportError(message);
      throw new Error(message);
    } finally {
      if (this.isCurrentToken(token)) {
        if (this.pendingAbort === controller) this.pendingAbort = null;
      }
    }
  }

  /** Start playback, resuming the Web Audio context from the current gesture. */
  public async play(): Promise<void> {
    this.assertUsable();
    this.playbackRequested = true;
    this.emitState();
    if (this.loading && !this.sourceReady) return;
    await this.playInternal(this.loadToken);
  }

  /** Pause playback and publish the resulting state. */
  public pause(): void {
    if (this.disposed) return;
    this.playRevision++;
    this.playbackRequested = false;
    this.audio.pause();
    this.playing = false;
    this.emitState();
  }

  public async toggle(): Promise<void> {
    this.assertUsable();
    if (!this.playbackRequested) {
      await this.play();
    } else {
      this.pause();
    }
  }

  /** Seek to a finite position, clamped to the media duration when known. */
  public seek(seconds: number): void {
    if (this.disposed) return;

    const requested = Number.isFinite(seconds) ? seconds : 0;
    const mediaDuration = this.finiteNonNegative(this.audio.duration);
    const duration = mediaDuration ?? this.finiteNonNegative(this.duration) ?? 0;
    const bounded = Math.max(0, duration > 0 ? Math.min(requested, duration) : requested);

    try {
      this.audio.currentTime = Number.isFinite(bounded) ? bounded : 0;
    } catch {
      // Media elements can reject currentTime changes before metadata exists.
      // Keeping the requested state at zero is more useful than throwing from
      // a slider callback.
      this.currentTime = 0;
    }

    this.updateTimeFromAudio();
    this.emitState();
  }

  public setVolume(value: number): void {
    if (this.disposed) return;
    const next = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    this.volume = next;
    this.audio.volume = next;
    this.emitState();
  }

  /** Return RMS frequency energy in [0, 1], or zero before analysis is ready. */
  public getEnergy(): number {
    if (!this.analyser || !this.frequencyData || this.disposed) return 0;

    try {
      this.analyser.getByteFrequencyData(this.frequencyData);
    } catch {
      return 0;
    }

    if (this.frequencyData.length === 0) return 0;
    let sumSquares = 0;
    for (const value of this.frequencyData) {
      const normalized = value / 255;
      sumSquares += normalized * normalized;
    }
    return Math.max(0, Math.min(1, Math.sqrt(sumSquares / this.frequencyData.length)));
  }

  /** Release listeners, network work, and the optional Web Audio graph. */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    ++this.loadToken;
    this.cancelPendingReady?.();
    this.cancelPendingReady = null;
    this.pendingAbort?.abort();
    this.pendingAbort = null;

    this.audio.pause();
    this.audio.removeEventListener('loadstart', this.onLoadStart);
    this.audio.removeEventListener('loadedmetadata', this.onLoadedMetadata);
    this.audio.removeEventListener('durationchange', this.onDurationChange);
    this.audio.removeEventListener('timeupdate', this.onTimeUpdate);
    this.audio.removeEventListener('waiting', this.onWaiting);
    this.audio.removeEventListener('canplay', this.onCanPlay);
    this.audio.removeEventListener('playing', this.onPlaying);
    this.audio.removeEventListener('pause', this.onPause);
    this.audio.removeEventListener('ended', this.onEnded);
    this.audio.removeEventListener('error', this.onMediaError);

    this.audioContext?.removeEventListener('statechange', this.connectRunningGraph);
    this.mediaSource?.disconnect();
    this.analyser?.disconnect();
    this.mediaSource = null;
    this.analyser = null;
    this.frequencyData = null;

    if (this.audioContext && this.audioContext.state !== 'closed') {
      void this.audioContext.close().catch(() => undefined);
    }
    this.audioContext = null;
  }

  private async playInternal(token?: number): Promise<void> {
    if (token !== undefined && !this.isCurrentToken(token)) return;

    const revision = ++this.playRevision;
    const current = () => !this.disposed && revision === this.playRevision && (token === undefined || this.isCurrentToken(token));
    const source = this.audio.currentSrc || this.audio.src;
    if (!source || !this.sourceReady) {
      const message = this.loading ? '音频正在加载，请稍候。' : '没有可播放的音频，请先选择歌曲。';
      this.playbackRequested = false;
      this.emitState();
      this.reportError(message);
      throw new Error(message);
    }

    const context = this.ensureAudioGraph();
    if (context && context.state === 'suspended') {
      try {
        void context.resume().catch(() => {
          this.reportAnalysisNotice('频谱分析未启动，继续使用原生音频播放。');
        });
      } catch {
        // Audio playback itself can still work when the analyser context is
        // blocked. Surface the limitation and let media.play() decide whether
        // the current gesture is sufficient for playback.
        this.reportAnalysisNotice('浏览器暂时阻止了音频分析；播放仍会继续尝试。');
      }
    }

    if (token !== undefined && !this.isCurrentToken(token)) return;

    try {
      await Promise.resolve(this.audio.play());
    } catch (error) {
      if (!current()) return;
      const message = this.playErrorMessage(error);
      this.playbackRequested = false;
      this.playing = false;
      this.loading = false;
      this.emitState();
      this.reportError(message);
      throw new Error(message);
    }

    if (!current() || !this.playbackRequested) return;
    this.playing = true;
    this.loading = false;
    this.emitState();
  }

  private ensureAudioGraph(): AudioContext | null {
    if (this.audioContext || this.analysisUnavailable || this.disposed) {
      return this.audioContext;
    }

    const contextConstructor = this.audioContextConstructor();
    if (!contextConstructor) {
      this.analysisUnavailable = true;
      this.reportAnalysisNotice('当前浏览器不支持频谱分析。');
      return null;
    }

    try {
      this.audioContext = new contextConstructor();
      // A suspended context must not capture the media element: doing so
      // mutes native playback in hosts that cannot resume Web Audio.
      this.audioContext.addEventListener('statechange', this.connectRunningGraph);
      this.connectRunningGraph();
      return this.audioContext;
    } catch {
      const failedContext = this.audioContext;
      this.analysisUnavailable = true;
      this.audioContext = null;
      this.mediaSource = null;
      this.analyser = null;
      this.frequencyData = null;
      if (failedContext && failedContext.state !== 'closed') {
        void failedContext.close().catch(() => undefined);
      }
      this.reportAnalysisNotice('远程音频的跨域设置阻止了频谱分析；播放仍可继续。');
      return null;
    }
  }

  private readonly connectRunningGraph = (): void => {
    const context = this.audioContext;
    if (!context || context.state !== 'running' || this.mediaSource || this.disposed) return;
    try {
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      analyser.connect(context.destination);
      const source = context.createMediaElementSource(this.audio);
      source.connect(analyser);
      this.analyser = analyser;
      this.mediaSource = source;
      this.frequencyData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    } catch {
      this.analysisUnavailable = true;
      this.reportAnalysisNotice('频谱分析不可用，音频继续通过浏览器播放。');
    }
  };

  private audioContextConstructor(): AudioContextConstructor | null {
    if (typeof window === 'undefined') return null;

    const windowWithWebkit = window as Window & {
      webkitAudioContext?: AudioContextConstructor;
    };
    return window.AudioContext ?? windowWithWebkit.webkitAudioContext ?? null;
  }

  private waitForReady(token: number): Promise<boolean> {
    this.cancelPendingReady?.();
    this.readyWaitActive = true;

    return new Promise<boolean>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        finish(false, new Error('音频加载超时：远程地址可能已失效，或服务器未返回可播放内容。'));
      }, 15_000);
      const cleanup = (): void => {
        clearTimeout(timeout);
        this.audio.removeEventListener('loadedmetadata', onReady);
        this.audio.removeEventListener('canplay', onReady);
        this.audio.removeEventListener('error', onError);
        if (this.cancelPendingReady === cancel) this.cancelPendingReady = null;
        this.readyWaitActive = false;
      };
      const finish = (ready: boolean, error?: Error): void => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve(ready);
      };
      const onReady = (): void => {
        if (!this.isCurrentToken(token)) {
          finish(false);
          return;
        }
        finish(true);
      };
      const onError = (): void => finish(false, new Error(this.mediaErrorMessage()));
      const cancel = (): void => finish(false);

      this.cancelPendingReady = cancel;
      this.audio.addEventListener('loadedmetadata', onReady);
      this.audio.addEventListener('canplay', onReady);
      this.audio.addEventListener('error', onError);

      if (!this.isCurrentToken(token)) {
        finish(false);
      } else if (this.audio.error) {
        finish(false, new Error(this.mediaErrorMessage()));
      } else if (this.audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        finish(true);
      }
    });
  }

  private updateDurationFromAudio(): void {
    const mediaDuration = this.finiteNonNegative(this.audio.duration);
    if (mediaDuration !== null) this.duration = mediaDuration;
  }

  private updateTimeFromAudio(): void {
    const time = this.finiteNonNegative(this.audio.currentTime);
    if (time !== null) this.currentTime = time;
  }

  private emitState(): void {
    if (this.disposed) return;
    const detail: AudioEngineState = {
      playing: this.playing,
      playbackRequested: this.playbackRequested,
      loading: this.loading,
      currentTime: this.currentTime,
      duration: this.duration,
      volume: this.volume,
      preview: this.preview,
    };
    this.dispatchEvent(new CustomEvent<AudioEngineState>('state', { detail }));
  }

  private reportError(message: string): void {
    if (this.disposed) return;
    this.dispatchEvent(new CustomEvent<string>('error', { detail: message }));
  }

  private reportNotice(message: string): void {
    if (this.disposed) return;
    this.dispatchEvent(new CustomEvent<string>('notice', { detail: message }));
  }

  private reportAnalysisNotice(message: string): void {
    if (this.analysisNoticeSent) return;
    this.analysisNoticeSent = true;
    this.reportNotice(message);
  }

  private mediaErrorMessage(): string {
    const code = this.audio.error?.code;
    if (this.currentTrack?.source !== 'local' && (code === 2 || code === 4)) {
      return '远程音频加载失败：地址可能已失效，或服务器没有允许跨域访问（CORS）。';
    }
    if (code && AUDIO_ERROR_MESSAGES[code]) return AUDIO_ERROR_MESSAGES[code];
    return '音频播放失败：远程地址可能已失效，或服务器拒绝了跨域访问（CORS）。';
  }

  private playErrorMessage(error: unknown): string {
    const name = this.errorName(error);
    if (name === 'NotAllowedError') {
      return '浏览器阻止了自动播放，请点击播放按钮后重试。';
    }
    if (name === 'NotSupportedError') {
      return '当前浏览器不支持此音频格式或地址。';
    }
    if (name === 'AbortError') {
      return '音频播放被取消。';
    }
    return this.mediaErrorMessage();
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) return error.message;
    const name = this.errorName(error);
    if (name === 'AbortError') return '音频加载被取消。';
    if (name === 'TypeError') return '无法加载音频：网络错误或服务器拒绝了跨域访问（CORS）。';
    return fallback;
  }

  private errorName(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'name' in error) {
      const name = (error as { name?: unknown }).name;
      return typeof name === 'string' ? name : '';
    }
    return '';
  }

  private isAbortError(error: unknown): boolean {
    return this.errorName(error) === 'AbortError';
  }

  private finiteNonNegative(value: number): number | null {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  private isCurrentToken(token: number): boolean {
    return !this.disposed && token === this.loadToken;
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('AudioEngine 已释放。');
  }
}

export default AudioEngine;
