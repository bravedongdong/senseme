# SenseMe music server

`server/index.mjs` starts a dependency-free Node 18 HTTP server on
`127.0.0.1:3001`. It uses the built-in `http`, `fetch`, and filesystem APIs;
no Express is required. The server also exports
`createMusicServer()` for tests or for embedding in another Node process.

The local demo catalog is always available. In production, static files are
served from `dist/` (or from `SENSEME_DIST_DIR` when set). Paths are resolved
under that directory and symlink escapes are rejected. Vite is expected to
proxy `/api` during local development, so the server does not add a CORS
layer.

## Track shape

Every catalog or search result uses:

```json
{
  "id": "string",
  "title": "string",
  "artist": "string",
  "album": "string",
  "cover": "string",
  "duration": 32,
  "source": "demo",
  "url": "/audio/tide.wav",
  "channel": "relax"
}
```

`duration` is always seconds. `url` and `channel` are optional. The demo
tracks are `tide`, `glass`, `afterglow`, `drift`, `night`, and `first-light`;
their titles are Tide, Glass, Afterglow, Drift, Night Swimming, and First
Light. They are all authored by SenseMe Sessions, have `source: "demo"`, and
use `/audio/{id}.wav` plus `/covers/{id}.svg` paths. Each demo duration is 32
seconds.

## Endpoints

### `GET /api/health`

Returns the process status and whether each remote provider is configured:

```json
{
  "ok": true,
  "service": "senseme-music",
  "providers": { "netease": true, "itunes": true }
}
```

`netease: true` means either `NETEASE_API_BASE` or the optional built-in
adapter is enabled; the package itself is loaded lazily on the first Netease
request.

### `GET /api/tracks?channel=relax`

Returns `{ "tracks": [], "provider": "demo" }`. Omitting `channel` returns
the complete local catalog. A channel with no match returns an empty array.

### `GET /api/search?q=...&provider=netease|itunes`

Searches the requested provider and returns `{ tracks, provider, notice? }`.
With no `provider`, Netease is selected when `NETEASE_API_BASE` is configured
or when the optional built-in package is installed; otherwise iTunes is
selected. iTunes results include an `url` when Apple supplies a short preview
clip and include a notice explaining that previews are samples.

### `GET /api/track/:id/url?provider=netease|itunes`

Returns `{ "url": "https://...", "preview": false, "provider": "..." }`.
iTunes responses set `preview: true`, because Apple exposes short previews.
Netease URLs come directly from the configured compatible API or its built-in
package. A missing or restricted URL is reported as `404`; the server does
not unlock, gray-track, replace, or otherwise bypass paid content.

For a local demo id, `provider=demo` is optional and returns its local WAV URL.

### `GET /api/lyrics/:id?provider=netease`

Fetches the Netease-compatible `/lyric` endpoint and returns:

```json
{
  "id": "123",
  "provider": "netease",
  "lyrics": "[00:00.00]...",
  "translatedLyrics": "",
  "lrc": { "lyric": "..." },
  "tlyric": null,
  "yrc": null
}
```

### `GET /api/playlist/:id?provider=netease`

Optional playlist import. It calls `/playlist/detail` and, when necessary,
`/song/detail`, then returns `{ id, title, provider, tracks }`.

## Provider setup and errors

Set `NETEASE_API_BASE` to an already running NeteaseCloudMusicApi-compatible
service, for example `http://127.0.0.1:3000`. This external service always
takes priority over the built-in adapter:

```sh
NETEASE_API_BASE=http://127.0.0.1:3000 node server/index.mjs
```

When `NETEASE_API_BASE` is absent, the server lazily imports
`@neteasecloudmusicapienhanced/api` and calls only its
`cloudsearch`, `song_url_v1`, `lyric`, `playlist_detail`, and `song_detail`
functions. The package is never started as an Express server. Calls pass
`unblock: "false"`, an empty anonymous cookie, `proxy: ""`, and
`randomCNIP: false`; this adapter does not unlock, proxy, or replace paid
sources. The package repository README currently targets Node 22+, but
`@neteasecloudmusicapienhanced/api@4.40.1` was also exercised successfully in
this workspace on Node 18.20.5 and Node 24.19.0. Node 24 is the safer runtime
for the package; the server itself and the external API/iTunes paths remain
Node 18 compatible.

The server uses only the documented read/search endpoints
`/cloudsearch`, `/song/url/v1`, `/lyric`, `/playlist/detail`, and
`/song/detail`. It does not require a login. iTunes uses Apple's public
`https://itunes.apple.com/search` and `/lookup` endpoints without a key.

Upstream requests have an eight-second timeout. Non-JSON responses, network
failures, timeouts, malformed provider payloads, unsupported providers, and
unavailable tracks return JSON such as:

```json
{
  "error": {
    "code": "upstream_timeout",
    "message": "The itunes provider timed out.",
    "provider": "itunes",
    "notice": "Try again later or switch providers."
  },
  "notice": "Try again later or switch providers."
}
```

Run the focused tests with:

```sh
node --test server/*.test.mjs
```

## Production audio and playlist completion

Static audio accepts single byte Range requests (206, Content-Range, Accept-Ranges; invalid ranges return 416). Missing song details in a playlist are fetched in batches of 200 and reordered by the original trackIds. Unavailable metadata is reported in notice. Netease freeTrialInfo with a non-empty time interval marks the returned URL as a preview. The demo album is Ambient Studies.
