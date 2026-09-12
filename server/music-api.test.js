'use strict';

import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createMusicServer,
  createNeteaseProvider,
  normalizeItunesTrack,
  normalizeTrack,
  normalizeNeteaseTrack,
  requestJson,
} from './music-api.js';

async function withServer(options, callback) {
  const server = createMusicServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    return await callback(base);
  } finally {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections?.();
    await closed;
  }
}

test('normalizes Netease and iTunes song shapes to seconds and strings', () => {
  assert.deepEqual(normalizeNeteaseTrack({
    id: 42,
    name: 'Tide',
    ar: [{ name: 'SenseMe Sessions' }],
    al: { name: 'Sessions', picUrl: 'https://img.test/tide.jpg' },
    dt: 90500,
  }), {
    id: '42',
    title: 'Tide',
    artist: 'SenseMe Sessions',
    album: 'Sessions',
    cover: 'https://img.test/tide.jpg',
    duration: 91,
    source: 'netease',
  });

  assert.deepEqual(normalizeItunesTrack({
    trackId: 7,
    trackName: 'Glass',
    artistName: 'A. N. Other',
    collectionName: 'Singles',
    artworkUrl100: 'https://img.test/100x100bb.jpg',
    trackTimeMillis: 24100,
    previewUrl: 'https://audio.test/preview.m4a',
  }), {
    id: '7',
    title: 'Glass',
    artist: 'A. N. Other',
    album: 'Singles',
    cover: 'https://img.test/100x100bb.jpg',
    duration: 24,
    source: 'itunes',
    url: 'https://audio.test/preview.m4a',
  });
});

test('built-in Netease adapter uses the package functions without unlock or proxy options', async () => {
  const calls = [];
  const keyFile = path.join(os.tmpdir(), `senseme-test-xeapi-${process.pid}-${Date.now()}`);
  const builtinApi = {
    async register_xeapikey(params) {
      calls.push(['register_xeapikey', params]);
      return { status: 200, body: { sk: 'test-public-key', version: 'test' } };
    },
    async cloudsearch(params) {
      calls.push(['cloudsearch', params]);
      return { status: 200, body: { code: 200, result: { songs: [{ id: 9, name: 'Open Water', ar: [{ name: 'Demo Artist' }], al: { name: 'Demo Album', picUrl: 'https://img.test/open.jpg' }, dt: 32000 }] } } };
    },
    async song_url_v1(params) {
      calls.push(['song_url_v1', params]);
      return { status: 200, body: { code: 200, data: [{ id: 9, url: 'https://audio.test/open.mp3' }] } };
    },
    async lyric(params) {
      calls.push(['lyric', params]);
      return { status: 200, body: { code: 200, lrc: { lyric: '[00:00.00]Open Water' } } };
    },
    async playlist_detail(params) {
      calls.push(['playlist_detail', params]);
      return { status: 200, body: { code: 200, playlist: { name: 'Open List', tracks: [], trackIds: [{ id: 9 }] } } };
    },
    async song_detail(params) {
      calls.push(['song_detail', params]);
      return { status: 200, body: { code: 200, songs: [{ id: 9, name: 'Open Water', ar: [{ name: 'Demo Artist' }], al: { name: 'Demo Album' }, dt: 32000 }] } };
    },
  };

  try {
    const provider = createNeteaseProvider({ builtinApi, builtinKeyFile: keyFile });
    const tracks = await provider.search('open water', { limit: 1 });
    const source = await provider.trackUrl('9');
    const lyrics = await provider.lyrics('9');
    const playlist = await provider.playlist('77');

    assert.equal(tracks[0].source, 'netease');
    assert.deepEqual(source, { url: 'https://audio.test/open.mp3', preview: false });
    assert.equal(lyrics.lyrics, '[00:00.00]Open Water');
    assert.equal(playlist.tracks[0].id, '9');
    const operationNames = calls.map(([name]) => name);
    assert.deepEqual(operationNames, [
      'cloudsearch', 'register_xeapikey', 'song_url_v1', 'lyric', 'playlist_detail', 'song_detail',
    ]);
    for (const [, params] of calls.filter(([name]) => name !== 'register_xeapikey')) {
      assert.equal(params.unblock, 'false');
      assert.equal(params.proxy, '');
      assert.equal(params.randomCNIP, false);
      assert.deepEqual(params.cookie, {});
      assert.equal(params.e_r, 'false');
    }
  } finally {
    await fs.promises.rm(keyFile, { force: true });
  }
});

test('NETEASE_API_BASE path is used before the optional built-in loader', async () => {
  let builtinLoaded = false;
  let requestedUrl = '';
  const provider = createNeteaseProvider({
    baseUrl: 'http://provider.test/api',
    builtinLoader: async () => {
      builtinLoaded = true;
      throw new Error('built-in should not load');
    },
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify({
        code: 200,
        result: { songs: [{ id: 3, name: 'External Song', ar: [{ name: 'Artist' }], al: { name: 'Album' }, dt: 32000 }] },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const tracks = await provider.search('external', { limit: 1 });
  assert.equal(builtinLoaded, false);
  assert.match(requestedUrl, /^http:\/\/provider\.test\/api\/cloudsearch\?/);
  assert.equal(tracks[0].title, 'External Song');
});

test('demo tracks endpoint returns the six-track relax catalog', async () => {
  await withServer({}, async (base) => {
    const response = await fetch(`${base}/api/tracks?channel=relax`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.provider, 'demo');
    assert.equal(body.tracks.length, 6);
    assert.deepEqual(body.tracks.map((track) => track.id), [
      'tide', 'glass', 'afterglow', 'drift', 'night', 'first-light',
    ]);
    assert.ok(body.tracks.every((track) => track.source === 'demo' && track.duration === 32));
  });
});

test('provider failures become a useful JSON error instead of a server crash', async () => {
  await withServer({
    defaultProvider: 'itunes',
    providers: {
      itunes: {
        configured: true,
        async search() {
          throw new Error('simulated outage');
        },
      },
      netease: { configured: false },
    },
  }, async (base) => {
    const response = await fetch(`${base}/api/search?q=quiet&provider=itunes`);
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.error.code, 'provider_error');
    assert.equal(body.error.provider, 'itunes');
    assert.match(body.notice, /switch providers/i);
  });
});

test('requestJson rejects an explicitly non-JSON upstream response', async () => {
  await assert.rejects(
    requestJson('https://provider.test/search', {
      provider: 'itunes',
      fetchImpl: async () => new Response('<html>nope</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    }),
    (error) => error.code === 'upstream_invalid_json' && error.status === 502,
  );
});

test('missing search query and unsafe static paths are handled explicitly', async () => {
  await withServer({ distRoot: '/tmp/senseme-test-dist-that-does-not-exist' }, async (base) => {
    const missingQuery = await fetch(`${base}/api/search`);
    assert.equal(missingQuery.status, 400);
    assert.equal((await missingQuery.json()).error.code, 'missing_query');

    const traversal = await fetch(`${base}/%2e%2e/%2e%2e/etc/passwd`);
    assert.notEqual(traversal.status, 200);
    assert.equal((await traversal.json()).error.code, 'file_not_found');
  });
});

test('Apple thumbnails use a larger CDN variant without rewriting other artwork', () => {
 const song={trackId:1,artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/album/100x100bb.jpg'};
 assert.equal(normalizeTrack(song,'itunes').cover,'https://is1-ssl.mzstatic.com/image/thumb/album/600x600bb.jpg');
 assert.equal(normalizeTrack({...song,artworkUrl600:'https://img.test/native.jpg'},'itunes').cover,'https://img.test/native.jpg');
 assert.equal(normalizeTrack({...song,artworkUrl100:'https://img.test/100x100bb.jpg'},'itunes').cover,'https://img.test/100x100bb.jpg');
 assert.equal(normalizeTrack(song,'itunes',{cover:'/covers/local.jpg'}).cover,'/covers/local.jpg');
});
