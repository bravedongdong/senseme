'use strict';

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath, URL } from 'node:url';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3001;
const DEFAULT_TIMEOUT_MS = 8000;
const NETEASE_BUILTIN_PACKAGE = '@neteasecloudmusicapienhanced/api';
const BUILTIN_XEAPI_KEY_FILE = path.join(os.tmpdir(), 'xeapi_public_key');
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * The six local tracks are deliberately small pieces of original audio. The
 * server only describes them here; the parent project can provide the actual
 * files in dist/audio and dist/covers.
 */
export const DEMO_TRACKS = Object.freeze([
  Object.freeze({
    id: 'tide',
    title: 'Tide',
    artist: 'SenseMe Sessions',
    album: 'Ambient Studies',
    cover: '/covers/tide.svg',
    duration: 32,
    source: 'demo',
    url: '/audio/tide.wav',
    channel: 'relax',
  }),
  Object.freeze({
    id: 'glass',
    title: 'Glass',
    artist: 'SenseMe Sessions',
    album: 'Ambient Studies',
    cover: '/covers/glass.svg',
    duration: 32,
    source: 'demo',
    url: '/audio/glass.wav',
    channel: 'relax',
  }),
  Object.freeze({
    id: 'afterglow',
    title: 'Afterglow',
    artist: 'SenseMe Sessions',
    album: 'Ambient Studies',
    cover: '/covers/afterglow.svg',
    duration: 32,
    source: 'demo',
    url: '/audio/afterglow.wav',
    channel: 'relax',
  }),
  Object.freeze({
    id: 'drift',
    title: 'Drift',
    artist: 'SenseMe Sessions',
    album: 'Ambient Studies',
    cover: '/covers/drift.svg',
    duration: 32,
    source: 'demo',
    url: '/audio/drift.wav',
    channel: 'relax',
  }),
  Object.freeze({
    id: 'night',
    title: 'Night Swimming',
    artist: 'SenseMe Sessions',
    album: 'Ambient Studies',
    cover: '/covers/night.svg',
    duration: 32,
    source: 'demo',
    url: '/audio/night.wav',
    channel: 'relax',
  }),
  Object.freeze({
    id: 'first-light',
    title: 'First Light',
    artist: 'SenseMe Sessions',
    album: 'Ambient Studies',
    cover: '/covers/first-light.svg',
    duration: 32,
    source: 'demo',
    url: '/audio/first-light.wav',
    channel: 'relax',
  }),
]);

export class MusicApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'MusicApiError';
    this.code = options.code || 'music_api_error';
    this.status = Number.isInteger(options.status) ? options.status : 502;
    this.provider = options.provider;
    this.notice = options.notice;
    this.cause = options.cause;
  }
}

function text(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function positiveSeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.max(0, Math.round(number));
}

function millisecondsToSeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return positiveSeconds(number / 1000);
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function validRemoteUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function validCoverUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const candidate = value.trim();
  if (candidate.startsWith('/') && !candidate.startsWith('//')) return candidate;
  return validRemoteUrl(candidate);
}

/**
 * Normalize the two upstream song shapes into the small shape consumed by the
 * player. Exported so it can be unit tested without making network requests.
 */
export function normalizeTrack(input, source, options = {}) {
  const song = input && typeof input === 'object' ? input : {};
  const provider = source === 'netease' || source === 'itunes' ? source : 'demo';

  const neteaseArtist = Array.isArray(song.ar)
    ? song.ar.map((artist) => firstString(artist && (artist.name || artist.artistName))).filter(Boolean).join(', ')
    : '';
  const neteaseAlbum = song.al && typeof song.al === 'object' ? song.al : {};
  let itunesArtwork = firstString(song.artworkUrl600, song.artworkUrl100, song.artworkUrl60);
  // Apple search commonly supplies a 100px thumbnail. Request the larger
  // variant only for its known image CDN and dimension suffix.
  if (!song.artworkUrl600 && itunesArtwork) {
    try {
      const artwork = new URL(itunesArtwork);
      if (artwork.hostname.endsWith('.mzstatic.com')) {
        artwork.pathname = artwork.pathname.replace(/\/(?:60|100)x(?:60|100)bb\.(jpg|png)$/i, '/600x600bb.$1');
        itunesArtwork = artwork.toString();
      }
    } catch { /* Invalid artwork is rejected by validCoverUrl below. */ }
  }
  const rawCover = firstString(
    options.cover,
    provider === 'netease' ? neteaseAlbum.picUrl : '',
    provider === 'itunes' ? itunesArtwork : '',
    song.cover,
    song.picUrl,
  );
  const cover = validCoverUrl(rawCover);

  const rawDuration = provider === 'itunes'
    ? (song.trackTimeMillis ?? song.duration)
    : (song.dt ?? song.duration ?? song.durationMs);
  const duration = provider === 'itunes'
    ? millisecondsToSeconds(rawDuration)
    : (song.durationMs !== undefined && song.dt === undefined
      ? millisecondsToSeconds(rawDuration)
      : positiveSeconds(rawDuration / (Number(rawDuration) > 1000 ? 1000 : 1)));

  const normalized = {
    id: firstString(song.id, song.trackId, song.trackID),
    title: firstString(song.name, song.trackName, song.title),
    artist: firstString(song.artistName, neteaseArtist, song.artist, song.author),
    album: firstString(song.collectionName, neteaseAlbum.name, song.album, song.albumName),
    cover,
    duration,
    source: provider,
  };

  const url = validRemoteUrl(song.previewUrl || song.url);
  if (url) normalized.url = url;
  if (options.channel) normalized.channel = String(options.channel);
  return normalized;
}

export function normalizeNeteaseTrack(song, options = {}) {
  return normalizeTrack(song, 'netease', options);
}

export function normalizeItunesTrack(song, options = {}) {
  return normalizeTrack(song, 'itunes', options);
}

function trimBaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new MusicApiError('NETEASE_API_BASE must be a valid http(s) URL.', {
      code: 'invalid_provider_config',
      status: 503,
      provider: 'netease',
    });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new MusicApiError('NETEASE_API_BASE must use http or https.', {
      code: 'invalid_provider_config',
      status: 503,
      provider: 'netease',
    });
  }
  return value.trim().replace(/\/+$/, '');
}

function queryUrl(base, endpoint, params) {
  const url = new URL(String(endpoint).replace(/^\/+/, ''), `${base.replace(/\/+$/, '')}/`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

const BUILTIN_NCM_OPTIONS = Object.freeze({
  // The package's song_url_v1 module only attempts source matching when this
  // is the literal string "true". Keep it explicitly false at the adapter
  // boundary, along with proxy and random-IP options.
  unblock: 'false',
  proxy: '',
  randomCNIP: false,
  // An empty cookie object prevents an ambient NETEASE_COOKIE from being
  // picked up by the package's option helper. These endpoints are anonymous.
  cookie: Object.freeze({}),
  // Avoid the package's encrypted-response mode for this small adapter.
  e_r: 'false',
  noCookie: true,
});

function unwrapBuiltinApi(namespace) {
  let api = namespace;
  if (api && api.default && typeof api.default === 'object') api = api.default;
  if (api && api.default && typeof api.default === 'object') api = api.default;
  return api;
}

function builtinFailure(error, operation, code = 'builtin_provider_error') {
  if (error instanceof MusicApiError) return error;
  const statusCode = Number(error?.status);
  const bodyCode = Number(error?.body?.code);
  const status = statusCode === 404 || bodyCode === 404 ? 404 : 502;
  const detail = typeof error?.body?.msg === 'string' ? error.body.msg : '';
  return new MusicApiError(
    detail ? `Netease ${operation} failed: ${detail}` : `Netease ${operation} failed.`,
    {
      code,
      status,
      provider: 'netease',
      notice: 'The built-in Netease-compatible provider could not complete this request.',
      cause: error,
    },
  );
}

function withTimeout(task, timeoutMs, timeoutError) {
  const milliseconds = Number(timeoutMs);
  const work = Promise.resolve().then(task);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return work;

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(timeoutError()), milliseconds);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

async function loadBuiltinNeteaseApi(options = {}) {
  let namespace;
  try {
    namespace = options.builtinApi
      ? options.builtinApi
      : options.builtinLoader
        ? await options.builtinLoader()
        : await import(NETEASE_BUILTIN_PACKAGE);
  } catch (error) {
    throw new MusicApiError(
      `The built-in ${NETEASE_BUILTIN_PACKAGE} package is unavailable.`,
      {
        code: 'provider_dependency_missing',
        status: 503,
        provider: 'netease',
        notice: `Install ${NETEASE_BUILTIN_PACKAGE}, or set NETEASE_API_BASE to an external compatible API.`,
        cause: error,
      },
    );
  }

  const api = unwrapBuiltinApi(namespace);
  const required = ['cloudsearch', 'song_url_v1', 'lyric', 'playlist_detail', 'song_detail'];
  if (!api || required.some((name) => typeof api[name] !== 'function')) {
    throw new MusicApiError(
      `The built-in ${NETEASE_BUILTIN_PACKAGE} package does not expose the required API functions.`,
      {
        code: 'provider_dependency_invalid',
        status: 503,
        provider: 'netease',
        notice: 'Use a compatible package version or set NETEASE_API_BASE to an external compatible API.',
      },
    );
  }
  return api;
}

async function ensureBuiltinXeapiKey(api, keyFile = BUILTIN_XEAPI_KEY_FILE, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let current = {};
  try {
    current = JSON.parse(await fs.promises.readFile(keyFile, 'utf8'));
  } catch {
    // A fresh install has no key. The package's song_url_v1 module needs one
    // for its normal public request path, so obtain it through the package's
    // own key-registration module below.
  }
  if (current && current.sk) return;

  if (typeof api.register_xeapikey !== 'function') {
    throw new MusicApiError('The built-in Netease provider has no key registration function.', {
      code: 'builtin_setup_failed',
      status: 503,
      provider: 'netease',
      notice: 'Set NETEASE_API_BASE to an external compatible API.',
    });
  }

  let response;
  try {
    // register_xeapikey uses a standalone public endpoint and does not start
    // the package server or perform an unlock request.
    response = await withTimeout(
      () => api.register_xeapikey({ deviceId: '', currentKeyVersion: '' }),
      timeoutMs,
      () => new MusicApiError('The built-in Netease provider timed out while initializing its public request key.', {
        code: 'builtin_setup_timeout',
        status: 504,
        provider: 'netease',
        notice: 'Try again later or set NETEASE_API_BASE to an external compatible API.',
      }),
    );
  } catch (error) {
    if (error instanceof MusicApiError) throw error;
    throw new MusicApiError('The built-in Netease provider could not initialize its public request key.', {
      code: 'builtin_setup_failed',
      status: 502,
      provider: 'netease',
      notice: 'Try again later or set NETEASE_API_BASE to an external compatible API.',
      cause: error,
    });
  }

  const key = response?.body && typeof response.body === 'object' ? response.body : response;
  if (!key || typeof key !== 'object' || !key.sk) {
    throw new MusicApiError('The built-in Netease provider returned no usable public request key.', {
      code: 'builtin_setup_failed',
      status: 502,
      provider: 'netease',
      notice: 'Try again later or set NETEASE_API_BASE to an external compatible API.',
    });
  }
  try {
    await fs.promises.writeFile(keyFile, JSON.stringify(key), { mode: 0o600 });
  } catch (error) {
    throw new MusicApiError('The built-in Netease provider could not cache its public request key.', {
      code: 'builtin_setup_failed',
      status: 500,
      provider: 'netease',
      notice: 'Check temporary-directory permissions or set NETEASE_API_BASE.',
      cause: error,
    });
  }
}

function builtinResponseBody(response, operation) {
  const body = response && typeof response === 'object' && response.body && typeof response.body === 'object'
    ? response.body
    : response;
  const httpStatus = Number(response?.status);
  const resultCode = Number(body?.code);
  if (httpStatus >= 400 || resultCode >= 400 || resultCode < 0) {
    throw builtinFailure({ status: httpStatus || resultCode, body }, operation);
  }
  if (!body || typeof body !== 'object') {
    throw new MusicApiError(`Netease ${operation} returned an invalid response.`, {
      code: 'builtin_invalid_payload',
      status: 502,
      provider: 'netease',
      notice: 'The built-in provider response did not contain an object body.',
    });
  }
  return body;
}

async function callBuiltinNetease(api, operation, params, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const fn = api[operation];
  try {
    const response = await withTimeout(
      () => fn({ ...BUILTIN_NCM_OPTIONS, ...params }),
      timeoutMs,
      () => new MusicApiError(`The built-in Netease ${operation} request timed out.`, {
        code: 'builtin_upstream_timeout',
        status: 504,
        provider: 'netease',
        notice: 'Try again later or set NETEASE_API_BASE to an external compatible API.',
      }),
    );
    return builtinResponseBody(response, operation);
  } catch (error) {
    throw builtinFailure(error, operation);
  }
}

/**
 * Fetch and decode a JSON upstream response with a bounded timeout. A valid
 * JSON body with a missing content-type is accepted because a few compatible
 * Netease deployments omit that header; an explicitly non-JSON body is not.
 */
export async function requestJson(url, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const provider = options.provider;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  if (typeof fetchImpl !== 'function') {
    throw new MusicApiError('This Node runtime does not provide fetch.', {
      code: 'fetch_unavailable',
      status: 503,
      provider,
    });
  }

  const controller = new AbortController();
  let timedOut = false;
  let timer;
  const timeoutFailure = (cause) => new MusicApiError(`The ${provider || 'music'} provider timed out.`, {
    code: 'upstream_timeout',
    status: 504,
    provider,
    notice: 'Try again later or switch providers.',
    cause,
  });
  const timeoutPromise = timeoutMs > 0
    ? new Promise((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(timeoutFailure());
      }, timeoutMs);
    })
    : null;

  let response;
  try {
    const fetchRequest = () => fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    response = timeoutPromise ? await Promise.race([fetchRequest(), timeoutPromise]) : await fetchRequest();
  } catch (error) {
    if (error instanceof MusicApiError) throw error;
    if (timedOut || error && error.name === 'AbortError') throw timeoutFailure(error);
    throw new MusicApiError(`The ${provider || 'music'} provider is unavailable.`, {
      code: 'upstream_unavailable',
      status: 502,
      provider,
      notice: 'Check the provider configuration or try another provider.',
      cause: error,
    });
  }

  try {
    const readResponse = async () => {
      if (response && typeof response.text === 'function') {
        return { kind: 'text', value: await response.text() };
      }
      if (response && typeof response.json === 'function') {
        return { kind: 'json', value: await response.json() };
      }
      return { kind: 'text', value: '' };
    };
    const body = timeoutPromise ? await Promise.race([readResponse(), timeoutPromise]) : await readResponse();
    const status = Number(response && response.status) || 200;
    const ok = response && response.ok !== undefined ? response.ok : status >= 200 && status < 300;

    if (!ok) {
      throw new MusicApiError(`The ${provider || 'music'} provider returned HTTP ${status}.`, {
        code: 'upstream_http_error',
        status: 502,
        provider,
        notice: 'The provider could not complete this request.',
      });
    }

    const contentType = typeof response.headers?.get === 'function'
      ? response.headers.get('content-type') || ''
      : '';
    let parsed;
    if (body.kind === 'json') {
      parsed = body.value;
    } else {
      try {
        parsed = JSON.parse(body.value);
      } catch (error) {
        throw new MusicApiError(`The ${provider || 'music'} provider returned non-JSON data.`, {
          code: 'upstream_invalid_json',
          status: 502,
          provider,
          notice: contentType ? `Received ${contentType}.` : 'The provider response was not valid JSON.',
          cause: error,
        });
      }
    }
    // Apple's public Search API currently labels its JSON body as
    // text/javascript. Treat JavaScript JSON MIME types as JSON, while still
    // rejecting HTML, XML, and other explicitly non-JSON responses.
    if (contentType && !/(json|javascript)/i.test(contentType)) {
      throw new MusicApiError(`The ${provider || 'music'} provider returned non-JSON data.`, {
        code: 'upstream_invalid_json',
        status: 502,
        provider,
        notice: `Received ${contentType}.`,
      });
    }
    return parsed;
  } catch (error) {
    if (error instanceof MusicApiError) throw error;
    if (timedOut || error && error.name === 'AbortError') throw timeoutFailure(error);
    throw new MusicApiError(`The ${provider || 'music'} provider returned an unreadable response.`, {
      code: 'upstream_invalid_json',
      status: 502,
      provider,
      notice: 'The provider response was not valid JSON.',
      cause: error,
    });
  } finally {
    clearTimeout(timer);
  }
}

function ensureArray(value, provider, message) {
  if (Array.isArray(value)) return value;
  throw new MusicApiError(message, {
    code: 'upstream_invalid_payload',
    status: 502,
    provider,
    notice: 'The provider response did not contain the expected data.',
  });
}

export function createNeteaseProvider(options = {}) {
  const baseUrl = trimBaseUrl(options.baseUrl ?? process.env.NETEASE_API_BASE ?? '');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const builtinEnabled = options.builtin !== false;
  let builtinApiPromise;
  let builtinKeyPromise;

  function configured() {
    if (!baseUrl && !builtinEnabled) {
      throw new MusicApiError('Netease is not configured. Set NETEASE_API_BASE to a running Netease-compatible API.', {
        code: 'provider_not_configured',
        status: 503,
        provider: 'netease',
        notice: `Use provider=itunes, configure NETEASE_API_BASE, or install ${NETEASE_BUILTIN_PACKAGE}.`,
      });
    }
  }

  async function builtinApi() {
    if (!builtinEnabled) {
      throw new MusicApiError('The built-in Netease provider is disabled.', {
        code: 'provider_not_configured',
        status: 503,
        provider: 'netease',
        notice: 'Use provider=itunes or configure NETEASE_API_BASE.',
      });
    }
    if (!builtinApiPromise) {
      builtinApiPromise = loadBuiltinNeteaseApi(options);
    }
    return builtinApiPromise;
  }

  async function builtinTrackUrlReady() {
    const api = await builtinApi();
    if (!builtinKeyPromise) builtinKeyPromise = ensureBuiltinXeapiKey(api, options.builtinKeyFile, timeoutMs);
    await builtinKeyPromise;
    return api;
  }

  async function getJson(endpoint, params) {
    configured();
    return requestJson(queryUrl(baseUrl, endpoint, params), {
      fetchImpl,
      timeoutMs,
      provider: 'netease',
    });
  }

  return {
    name: 'netease',
    // `configured` also covers the optional built-in package. Loading is lazy
    // so a missing optional dependency becomes a JSON 503 at request time.
    configured: Boolean(baseUrl) || builtinEnabled,
    external: Boolean(baseUrl),
    builtin: builtinEnabled,
    async search(query, options = {}) {
      configured();
      const body = baseUrl
        ? await getJson('/cloudsearch', {
          keywords: query,
          limit: options.limit || 25,
          offset: options.offset || 0,
          type: 1,
        })
        : await callBuiltinNetease(await builtinApi(), 'cloudsearch', {
          keywords: query,
          limit: options.limit || 25,
          offset: options.offset || 0,
          type: 1,
        }, timeoutMs);
      const songs = body?.result?.songs ?? body?.songs;
      return ensureArray(songs, 'netease', 'The Netease search response contained no song list.')
        .map((song) => normalizeNeteaseTrack(song))
        .filter((song) => song.id && song.title);
    },
    async trackUrl(id) {
      configured();
      const body = baseUrl
        ? await getJson('/song/url/v1', { id, level: 'standard' })
        : await callBuiltinNetease(await builtinTrackUrlReady(), 'song_url_v1', {
          id,
          level: 'standard',
        }, timeoutMs);
      const rows = Array.isArray(body?.data) ? body.data : (body?.data ? [body.data] : []);
      const row = rows[0] || {};
      const url = validRemoteUrl(row.url || row.urlInfo?.url);
      if (!url) {
        throw new MusicApiError('This Netease track has no playable public URL.', {
          code: 'track_unavailable',
          status: 404,
          provider: 'netease',
          notice: 'The provider did not return an available source. Paid or restricted tracks are not bypassed.',
        });
      }
      return { url, preview: Boolean(row.freeTrialInfo && Number(row.freeTrialInfo.end) > Number(row.freeTrialInfo.start)) || row.isTrial === true };
    },
    async lyrics(id) {
      configured();
      const body = baseUrl
        ? await getJson('/lyric', { id })
        : await callBuiltinNetease(await builtinApi(), 'lyric', { id }, timeoutMs);
      if (!body || typeof body !== 'object') {
        throw new MusicApiError('The Netease lyrics response was empty.', {
          code: 'lyrics_unavailable',
          status: 404,
          provider: 'netease',
        });
      }
      return {
        id: String(id),
        provider: 'netease',
        lyrics: body.lrc?.lyric || '',
        translatedLyrics: body.tlyric?.lyric || '',
        lrc: body.lrc || null,
        tlyric: body.tlyric || null,
        yrc: body.yrc || null,
      };
    },
    async playlist(id) {
      configured();
      const body = baseUrl
        ? await getJson('/playlist/detail', { id })
        : await callBuiltinNetease(await builtinApi(), 'playlist_detail', { id }, timeoutMs);
      const playlist = body?.playlist;
      if (!playlist || typeof playlist !== 'object') {
        throw new MusicApiError('The Netease playlist was not found.', {
          code: 'playlist_unavailable',
          status: 404,
          provider: 'netease',
        });
      }
      let songs = Array.isArray(playlist.tracks) ? playlist.tracks : [];
      const orderedIds = Array.isArray(playlist.trackIds) ? playlist.trackIds.map(t => String(t?.id || '')).filter(Boolean) : [];
      const byId = new Map(songs.map(song => [String(song.id), song]));
      const missing = orderedIds.filter(id => !byId.has(id));
      for (let start = 0; start < missing.length; start += 200) {
        const ids = missing.slice(start, start + 200).join(',');
        const detail = baseUrl
          ? await getJson('/song/detail', { ids })
          : await callBuiltinNetease(await builtinApi(), 'song_detail', { ids }, timeoutMs);
        for (const song of detail?.songs || []) byId.set(String(song.id), song);
      }
      if (orderedIds.length) songs = orderedIds.map(id => byId.get(id)).filter(Boolean);
      const unavailable = Math.max(0, orderedIds.length - songs.length);
      return {
        id: String(id),
        title: firstString(playlist.name, `Playlist ${id}`),
        ...(unavailable ? { notice: `${unavailable} 首歌曲的资料不可用，已导入其余歌曲。` } : {}),
        provider: 'netease',
        tracks: songs.map((song) => normalizeNeteaseTrack(song)).filter((song) => song.id && song.title),
      };
    },
  };
}

export function createItunesProvider(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function getJson(endpoint, params) {
    return requestJson(queryUrl('https://itunes.apple.com', endpoint, params), {
      fetchImpl,
      timeoutMs,
      provider: 'itunes',
    });
  }

  return {
    name: 'itunes',
    configured: true,
    async search(query, options = {}) {
      const body = await getJson('/search', {
        term: query,
        media: 'music',
        entity: 'song',
        limit: options.limit || 25,
      });
      const songs = ensureArray(body?.results, 'itunes', 'The iTunes search response contained no result list.');
      return songs
        .filter((song) => song && (song.kind === undefined || song.kind === 'song'))
        .map((song) => normalizeItunesTrack(song))
        .filter((song) => song.id && song.title);
    },
    async trackUrl(id) {
      const body = await getJson('/lookup', { id, entity: 'song' });
      const results = ensureArray(body?.results, 'itunes', 'The iTunes lookup response contained no result list.');
      const song = results.find((item) => String(item?.trackId) === String(id)) || results.find((item) => item?.kind === 'song');
      const url = validRemoteUrl(song?.previewUrl);
      if (!url) {
        throw new MusicApiError('This iTunes track has no preview URL.', {
          code: 'preview_unavailable',
          status: 404,
          provider: 'itunes',
          notice: 'iTunes only exposes short previews for some tracks.',
        });
      }
      return {
        url,
        preview: true,
        notice: 'iTunes preview URLs are short samples supplied by Apple.',
      };
    },
  };
}

export function createProviders(options = {}) {
  const netease = options.netease || createNeteaseProvider(options);
  const itunes = options.itunes || createItunesProvider(options);
  return { netease, itunes };
}

function jsonHeaders() {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  };
}

function sendJson(response, status, body, method = 'GET') {
  const payload = JSON.stringify(body);
  response.writeHead(status, { ...jsonHeaders(), 'content-length': Buffer.byteLength(payload) });
  if (method !== 'HEAD') response.end(payload);
  else response.end();
}

function errorPayload(error, provider) {
  const musicError = error instanceof MusicApiError
    ? error
    : new MusicApiError('The music provider request failed.', {
      code: 'provider_error',
      status: 502,
      provider,
      notice: 'Try again later or switch providers.',
      cause: error,
    });
  const result = {
    error: {
      code: musicError.code,
      message: musicError.message,
      ...(musicError.provider || provider ? { provider: musicError.provider || provider } : {}),
    },
  };
  if (musicError.notice) {
    result.notice = musicError.notice;
    result.error.notice = musicError.notice;
  }
  return { status: musicError.status, body: result };
}

function decodePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new MusicApiError('The URL path is malformed.', {
      code: 'malformed_path',
      status: 400,
    });
  }
}

const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
});

export function parseByteRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || size === 0) return false;
  const suffix = !match[1];
  const first = Number(match[1]);
  const last = Number(match[2]);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return false;
  const start = suffix ? Math.max(0, size - last) : first;
  const end = suffix || !match[2] ? size - 1 : Math.min(size - 1, last);
  return start >= size || end < start ? false : { start, end };
}

async function serveStatic(response, pathname, method, distRoot, rangeHeader) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    sendJson(response, 400, { error: { code: 'malformed_path', message: 'The URL path is malformed.' } }, method);
    return true;
  }
  if (decoded.includes('\0')) {
    sendJson(response, 400, { error: { code: 'malformed_path', message: 'The URL path is malformed.' } }, method);
    return true;
  }

  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const candidate = path.resolve(distRoot, relative);
  if (candidate !== distRoot && !candidate.startsWith(`${distRoot}${path.sep}`)) {
    sendJson(response, 403, { error: { code: 'forbidden_path', message: 'That path is not available.' } }, method);
    return true;
  }

  let stat;
  try {
    stat = await fs.promises.stat(candidate);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    sendJson(response, 500, { error: { code: 'static_read_failed', message: 'The requested file could not be read.' } }, method);
    return true;
  }
  if (!stat.isFile()) return false;

  // Resolve symlinks before serving so a file linked outside dist cannot be
  // used to escape the static root.
  try {
    const [realRoot, realCandidate] = await Promise.all([
      fs.promises.realpath(distRoot),
      fs.promises.realpath(candidate),
    ]);
    if (realCandidate !== realRoot && !realCandidate.startsWith(`${realRoot}${path.sep}`)) {
      sendJson(response, 403, { error: { code: 'forbidden_path', message: 'That path is not available.' } }, method);
      return true;
    }
  } catch {
    sendJson(response, 404, { error: { code: 'file_not_found', message: 'The requested file was not found.' } }, method);
    return true;
  }

  const contentType = CONTENT_TYPES[path.extname(candidate).toLowerCase()] || 'application/octet-stream';
  const range = parseByteRange(rangeHeader, stat.size);
  const headers = { 'content-type': contentType, 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=3600' };
  if (range === false) {
    response.writeHead(416, { ...headers, 'content-range': `bytes */${stat.size}`, 'content-length': 0 });
    response.end();
    return true;
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? Math.max(0, stat.size - 1);
  headers['content-length'] = range ? end - start + 1 : stat.size;
  if (range) headers['content-range'] = `bytes ${start}-${end}/${stat.size}`;
  response.writeHead(range ? 206 : 200, headers);
  if (method === 'HEAD' || stat.size === 0) response.end();
  else {
    const stream = fs.createReadStream(candidate, { start, end });
    stream.on('error', () => response.destroy());
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  }
  return true;
}

function defaultProviderName(providers, requested) {
  if (requested) return requested.toLowerCase();
  if (providers.netease?.configured) return 'netease';
  return 'itunes';
}

function providerFor(providers, name) {
  const provider = providers[name];
  if (!provider) {
    throw new MusicApiError(`Unsupported provider: ${name}.`, {
      code: 'unsupported_provider',
      status: 400,
      provider: name,
      notice: 'Supported providers are netease and itunes.',
    });
  }
  return provider;
}

function makeTracksResult(tracks, provider, notice) {
  const result = { tracks, provider };
  if (notice) result.notice = notice;
  return result;
}

export function createMusicServer(options = {}) {
  const providers = options.providers || createProviders(options);
  const demoTracks = Array.isArray(options.demoTracks) ? options.demoTracks : DEMO_TRACKS;
  const distRoot = path.resolve(options.distRoot || process.env.SENSEME_DIST_DIR || path.join(MODULE_DIR, '..', 'dist'));
  const defaultProvider = options.defaultProvider || defaultProviderName(providers);

  return http.createServer(async (request, response) => {
    const method = String(request.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      response.setHeader('allow', 'GET, HEAD');
      sendJson(response, 405, { error: { code: 'method_not_allowed', message: 'Only GET is supported.' } }, method);
      return;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(request.url || '/', `http://${request.headers.host || `${DEFAULT_HOST}:${DEFAULT_PORT}`}`);
    } catch {
      sendJson(response, 400, { error: { code: 'malformed_url', message: 'The request URL is malformed.' } }, method);
      return;
    }

    const pathname = parsedUrl.pathname;
    const segments = pathname.split('/').filter(Boolean);
    let requestedProvider = parsedUrl.searchParams.get('provider');
    if (requestedProvider) requestedProvider = requestedProvider.trim().toLowerCase();

    try {
      if (pathname === '/api/health') {
        sendJson(response, 200, {
          ok: true,
          service: 'senseme-music',
          providers: {
            netease: Boolean(providers.netease?.configured),
            itunes: Boolean(providers.itunes),
          },
        }, method);
        return;
      }

      if (pathname === '/api/tracks') {
        const channel = parsedUrl.searchParams.get('channel');
        const tracks = channel
          ? demoTracks.filter((track) => String(track.channel || '').toLowerCase() === channel.toLowerCase())
          : demoTracks;
        sendJson(response, 200, makeTracksResult(tracks.map((track) => ({ ...track })), 'demo'), method);
        return;
      }

      if (pathname === '/api/search') {
        const query = (parsedUrl.searchParams.get('q') || '').trim();
        if (!query) {
          throw new MusicApiError('Search query q is required.', {
            code: 'missing_query',
            status: 400,
          });
        }
        const name = defaultProviderName(providers, requestedProvider || defaultProvider);
        const provider = providerFor(providers, name);
        if (typeof provider.search !== 'function') {
          throw new MusicApiError(`Provider ${name} does not support search.`, {
            code: 'unsupported_operation',
            status: 400,
            provider: name,
          });
        }
        const tracks = await provider.search(query, { limit: 25 });
        const notice = name === 'itunes'
          ? 'iTunes results include short preview clips where Apple provides them.'
          : undefined;
        sendJson(response, 200, makeTracksResult(tracks, name, notice), method);
        return;
      }

      if (segments.length === 4 && segments[0] === 'api' && segments[1] === 'track' && segments[3] === 'url') {
        const id = decodePathSegment(segments[2]);
        const name = requestedProvider || (demoTracks.some((track) => String(track.id) === id) ? 'demo' : defaultProvider);
        if (name === 'demo') {
          const track = demoTracks.find((candidate) => String(candidate.id) === id);
          if (!track) {
            throw new MusicApiError('Demo track not found.', { code: 'track_not_found', status: 404, provider: 'demo' });
          }
          sendJson(response, 200, { url: track.url, preview: false, provider: 'demo' }, method);
          return;
        }
        const provider = providerFor(providers, name);
        if (typeof provider.trackUrl !== 'function') {
          throw new MusicApiError(`Provider ${name} does not support track URLs.`, {
            code: 'unsupported_operation',
            status: 400,
            provider: name,
          });
        }
        const result = await provider.trackUrl(id);
        sendJson(response, 200, { ...result, provider: name }, method);
        return;
      }

      if (segments.length === 3 && segments[0] === 'api' && segments[1] === 'lyrics') {
        const id = decodePathSegment(segments[2]);
        const name = requestedProvider || 'netease';
        if (name !== 'netease') {
          throw new MusicApiError('Lyrics are currently available through the Netease-compatible provider only.', {
            code: 'unsupported_provider',
            status: 400,
            provider: name,
          });
        }
        const provider = providerFor(providers, name);
        if (typeof provider.lyrics !== 'function') {
          throw new MusicApiError('The selected provider does not support lyrics.', {
            code: 'unsupported_operation',
            status: 400,
            provider: name,
          });
        }
        sendJson(response, 200, await provider.lyrics(id), method);
        return;
      }

      if (segments.length === 3 && segments[0] === 'api' && segments[1] === 'playlist') {
        const id = decodePathSegment(segments[2]);
        const name = requestedProvider || 'netease';
        const provider = providerFor(providers, name);
        if (typeof provider.playlist !== 'function') {
          throw new MusicApiError(`Provider ${name} does not support playlist import.`, {
            code: 'unsupported_operation',
            status: 400,
            provider: name,
          });
        }
        sendJson(response, 200, await provider.playlist(id), method);
        return;
      }

      if (pathname.startsWith('/api/')) {
        sendJson(response, 404, { error: { code: 'route_not_found', message: 'API route not found.' } }, method);
        return;
      }

      if (!(await serveStatic(response, pathname, method, distRoot, request.headers.range))) {
        sendJson(response, 404, { error: { code: 'file_not_found', message: 'The requested file was not found.' } }, method);
      }
    } catch (error) {
      const fallbackProvider = requestedProvider || undefined;
      const result = errorPayload(error, fallbackProvider);
      sendJson(response, result.status, result.body, method);
    }
  });
}

export function startServer(options = {}) {
  const host = options.host || process.env.HOST || (process.env.PORT ? '0.0.0.0' : DEFAULT_HOST);
  const port = options.port ?? (process.env.PORT ? Number(process.env.PORT) : DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT must be an integer between 0 and 65535.');
  }
  const server = options.server || createMusicServer(options);
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(server);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

export { DEFAULT_HOST, DEFAULT_PORT, DEFAULT_TIMEOUT_MS };
