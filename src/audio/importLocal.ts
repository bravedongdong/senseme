import type { IAudioMetadata, IPicture } from 'music-metadata-browser';

import type { Track } from '../types';

const FALLBACK_COVER = '/covers/tide.svg';

const AUDIO_EXTENSIONS = new Set([
  'aac',
  'aif',
  'aiff',
  'ape',
  'flac',
  'm4a',
  'm4b',
  'mp3',
  'mp4',
  'oga',
  'ogg',
  'opus',
  'wav',
  'wave',
  'webm',
  'wma',
]);

const IMAGE_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'webp']);

/**
 * Read local audio files into tracks. Metadata parsing is best effort: a file
 * that the browser can play remains importable even when its tags are absent
 * or the parser does not recognize its container.
 */
export async function importLocalFiles(files: File[]): Promise<Track[]> {
  const imageFiles = new Map<string, File>();
  const audioFiles: File[] = [];

  for (const file of files) {
    if (isImageFile(file)) {
      imageFiles.set(fileStem(file.name), file);
    } else if (isAudioFile(file)) {
      audioFiles.push(file);
    }
  }

  const usedIds = new Map<string, number>();
  return Promise.all(
    audioFiles.map(async (file, index) => {
      const audioUrl = URL.createObjectURL(file);
      let coverUrl = FALLBACK_COVER;

      try {
        const metadata = await readMetadata(file);
        const embeddedCover = metadata ? pictureObjectUrl(metadata.common.picture?.[0]) : undefined;
        if (embeddedCover) {
          coverUrl = embeddedCover;
        } else {
          const sidecar = imageFiles.get(fileStem(file.name));
          if (sidecar) coverUrl = URL.createObjectURL(sidecar);
        }

        const metadataDuration = metadata?.format.duration;
        const duration = positiveFinite(metadataDuration)
          ?? await readAudioDuration(audioUrl);
        const idBase = localTrackId(file, index);
        const id = uniqueId(idBase, usedIds);

        return {
          id,
          title: cleanText(metadata?.common.title) || displayName(file.name),
          artist: cleanText(metadata?.common.artist)
            || metadata?.common.artists?.map(cleanText).filter(Boolean).join(', ')
            || '未知艺人',
          album: cleanText(metadata?.common.album) || '未知专辑',
          cover: coverUrl,
          duration,
          source: 'local' as const,
          url: audioUrl,
        } satisfies Track;
      } catch (error) {
        // Only release the audio URL when building the track itself failed.
        // Parser and duration errors are handled by their own best-effort
        // fallbacks below, so this catch is reserved for unexpected failures.
        URL.revokeObjectURL(audioUrl);
        if (coverUrl.startsWith('blob:')) URL.revokeObjectURL(coverUrl);
        throw error;
      }
    }),
  );
}

/** Revoke object URLs owned by imported local tracks. */
export function releaseLocalTracks(tracks: Track[]): void {
  const urls = new Set<string>();
  for (const track of tracks) {
    if (track.source !== 'local') continue;
    if (track.url?.startsWith('blob:')) urls.add(track.url);
    if (track.cover.startsWith('blob:')) urls.add(track.cover);
  }
  for (const url of urls) URL.revokeObjectURL(url);
}

function isAudioFile(file: File): boolean {
  if (file.type.toLowerCase().startsWith('audio/')) return true;
  return AUDIO_EXTENSIONS.has(extension(file.name));
}

function isImageFile(file: File): boolean {
  if (file.type.toLowerCase().startsWith('image/')) return true;
  return IMAGE_EXTENSIONS.has(extension(file.name));
}

function extension(name: string): string {
  const match = /\.([^.]+)$/.exec(name);
  return match ? match[1].toLowerCase() : '';
}

function fileStem(name: string): string {
  const withoutExtension = name.replace(/\.[^.]*$/, '');
  return withoutExtension.trim().toLocaleLowerCase();
}

function displayName(name: string): string {
  const stem = name.replace(/\.[^.]*$/, '').trim();
  return stem || '未命名曲目';
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function positiveFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function localTrackId(file: File, index: number): string {
  const name = encodeURIComponent(file.name || 'track');
  return `local:${name}:${file.size}:${file.lastModified || 0}:${index}`;
}

function uniqueId(base: string, usedIds: Map<string, number>): string {
  const count = usedIds.get(base) ?? 0;
  usedIds.set(base, count + 1);
  return count === 0 ? base : `${base}:${count}`;
}

async function readMetadata(file: File): Promise<IAudioMetadata | null> {
  try {
    const { parseBlob } = await import('music-metadata-browser');
    return await parseBlob(file, { duration: true });
  } catch {
    return null;
  }
}

function pictureObjectUrl(picture: IPicture | undefined): string | undefined {
  if (!picture || !picture.data || picture.data.length === 0) return undefined;

  const mime = pictureMimeType(picture.format);
  if (!mime) return undefined;

  try {
    // Copy into an ArrayBuffer-backed view. Newer TypeScript DOM typings
    // distinguish ArrayBufferLike (which metadata parsers may expose) from
    // the ArrayBuffer accepted by BlobPart.
    const bytes = new Uint8Array(new ArrayBuffer(picture.data.byteLength));
    bytes.set(picture.data);
    return URL.createObjectURL(new Blob([bytes.buffer], { type: mime }));
  } catch {
    return undefined;
  }
}

function pictureMimeType(format: unknown): string | undefined {
  const value = typeof format === 'string' ? format.toLowerCase().trim() : '';
  if (value.startsWith('image/')) return value === 'image/jpg' ? 'image/jpeg' : value;
  switch (value.replace(/^\./, '')) {
    case 'avif': return 'image/avif';
    case 'bmp': return 'image/bmp';
    case 'gif': return 'image/gif';
    case 'jpeg':
    case 'jpg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    default: return undefined;
  }
}

function readAudioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    let probe: HTMLAudioElement;
    try {
      probe = new Audio();
    } catch {
      resolve(0);
      return;
    }
    probe.preload = 'metadata';
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const finish = (duration: number): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      probe.removeEventListener('loadedmetadata', onMetadata);
      probe.removeEventListener('error', onError);
      probe.removeEventListener('abort', onError);
      try {
        probe.removeAttribute('src');
        probe.load();
      } catch {
        // A non-browser test runtime may not implement media loading. The
        // metadata parser result is still useful in that environment.
      }
      resolve(positiveFinite(duration) ?? 0);
    };
    const onMetadata = (): void => finish(probe.duration);
    const onError = (): void => finish(0);

    probe.addEventListener('loadedmetadata', onMetadata);
    probe.addEventListener('error', onError);
    probe.addEventListener('abort', onError);
    timer = setTimeout(() => finish(0), 8_000);
    probe.src = url;
    probe.load();
  });
}
