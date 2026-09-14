import { NATIVE_BACKGROUNDS } from './scene/backgrounds';
import '@phosphor-icons/web/regular';
import './style.css';
import { SensMeScene } from './scene/SensMeScene';
import { AudioEngine, type AudioEngineState } from './audio/AudioEngine';
import { releaseLocalTracks } from './audio/importLocal';
import type { Track, TrackResponse } from './types';

const icon = (name: string) => `<i class="ph ph-${name}" aria-hidden="true"></i>`;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
<main id="player" aria-label="SenseMe 音乐播放器">
  <div id="scene"></div>
  <div class="lower-shade"></div>
  <header class="topbar">
    <button class="brand" id="about-button" aria-label="关于 SenseMe"><span>SensMe<sup>™</sup></span><small>channels</small></button>
    <div class="top-actions"><button id="library-button" class="text-button" aria-label="音乐库">${icon('music-notes')}<span>音乐库</span></button><button id="fullscreen" class="icon-button" aria-label="全屏" title="全屏 · F">${icon('corners-out')}</button></div>
  </header>
  <section id="now-playing" aria-label="正在播放">
    <div class="track-context"><span id="track-position">01 / 06</span><span id="source-label">原创示例</span><button id="favorite" class="icon-button" aria-label="收藏歌曲" aria-pressed="false">${icon('heart')}</button></div>
    <h1 id="track-title">正在准备音乐</h1>
    <div class="title-rule"></div>
    <p id="track-artist">SenseMe Sessions / Ambient Studies</p>
    <div class="seek-row"><span id="elapsed">0:00</span><input id="seek" aria-label="播放进度" type="range" min="0" max="32" value="0" step="0.1"/><span id="duration">0:32</span></div>
    <div class="transport">
      <button id="shuffle" class="icon-button secondary-control" aria-label="随机播放" aria-pressed="false" title="随机播放">${icon('shuffle')}</button>
      <button id="previous" class="icon-button" aria-label="上一首" title="上一首 · ←">${icon('skip-back')}</button>
      <button id="play" class="play-button" aria-label="播放" title="播放 / 暂停 · 空格">${icon('play')}</button>
      <button id="next" class="icon-button" aria-label="下一首" title="下一首 · →">${icon('skip-forward')}</button>
      <button id="repeat" class="icon-button secondary-control" aria-label="循环模式：列表循环" title="列表循环">${icon('repeat')}</button>
      <div class="volume-control"><button id="mute" class="icon-button" aria-label="静音">${icon('speaker-high')}</button><input id="volume" aria-label="音量" type="range" min="0" max="1" step="0.01" value="0.65"/></div>
    </div>
  </section>
  <footer class="bottom-bar">
    <button id="channels-button" class="channel-button" aria-label="切换心情频道">${icon('sun')}<span id="mood-name">Energetic</span>${icon('caret-down')}</button>
    <div class="bottom-actions"><button id="view-button" class="text-button" aria-label="切换原始 PSP 画质">${icon('monitor')}<span>高清</span></button><button id="queue-button" class="text-button" aria-label="播放列表">${icon('list')}<span>播放列表</span></button><button id="immersive-button" class="text-button" aria-label="沉浸" title="沉浸模式 · H">${icon('eye')}<span>沉浸</span></button></div>
  </footer>
  <button id="restore-ui" class="icon-button" aria-label="显示播放器控制">${icon('eye')}</button>
  <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
  <div id="scene-error" class="scene-error" role="alert" hidden></div>
</main>
<dialog id="library" class="library-panel" aria-labelledby="library-title">
  <div class="panel-heading"><div><span class="panel-kicker">YOUR MUSIC</span><h2 id="library-title">音乐库</h2></div><button class="icon-button close-dialog" aria-label="关闭音乐库">${icon('x')}</button></div>
  <div class="library-tabs" role="tablist"><button role="tab" data-tab="queue" aria-selected="true">播放列表</button><button role="tab" data-tab="search" aria-selected="false">在线搜索</button><button role="tab" data-tab="local" aria-selected="false">本地音乐</button></div>
  <section id="search-section" hidden><form id="search-form"><div class="search-field">${icon('magnifying-glass')}<input id="search-input" aria-label="搜索歌曲或歌手" placeholder="搜索歌曲、歌手或专辑" autocomplete="off"/><button class="search-submit" type="submit">搜索</button></div><div class="provider-field"><label for="provider">音源</label><select id="provider"><option value="netease">网易云音乐</option><option value="itunes">iTunes 试听</option></select></div></form><form id="playlist-form"><input id="playlist-input" aria-label="网易云歌单链接或 ID" placeholder="粘贴网易云歌单链接或 ID"/><button type="submit">导入歌单</button></form><p class="panel-note" id="provider-note">网易云公开可用音源；部分歌曲仅提供试听。</p></section>
  <section id="local-section" hidden><button id="import-button" class="import-zone">${icon('upload-simple')}<strong>添加你的音乐</strong><span>选择或拖入 MP3、FLAC、M4A、WAV</span><small>读取歌曲信息与封面，文件只留在你的设备上。</small></button><input type="file" id="file-input" accept="audio/*,.flac,.m4a,.mp3,.wav,.ogg,.aac,.aiff,image/*" multiple hidden/><p class="panel-note">本地文件在本次打开期间可用，也可同时选择同名封面图片。</p></section>
  <div id="list-caption" class="list-caption"><span>播放列表</span><span id="list-count"></span></div>
  <div id="track-list" class="track-list"></div>
  <p id="list-notice" class="panel-note" role="status"></p>
  <div class="library-footer"><button id="demo-button" class="subtle-button">${icon('wave-sine')} 加载原创示例</button><button id="favorites-button" class="subtle-button" aria-pressed="false">${icon('heart')} 收藏</button></div>
</dialog>
<dialog id="channels" class="channels-panel" aria-labelledby="channels-title"><div class="panel-heading"><div><span class="panel-kicker">SENSME CHANNELS</span><h2 id="channels-title">跟随此刻的心情</h2></div><button class="icon-button close-dialog" aria-label="关闭心情频道">${icon('x')}</button></div><div id="channel-grid" class="channel-grid"></div><p class="panel-note">切换水面与天空的氛围，保留当前播放列表。</p></dialog>
<dialog id="about" class="about-panel" aria-labelledby="about-title"><div class="panel-heading"><h2 id="about-title">重访水面的音乐</h2><button class="icon-button close-dialog" aria-label="关闭说明">${icon('x')}</button></div><p>以 PSP SensMe channels 为参考，重建漂浮唱片、水面倒影与切歌动画。</p><p>使用 Three.js 实时渲染。场景结合实机视频、原版布局参数与水波数据重建；渲染使用独立编写的 GLSL，仍有待核对的细节。</p><p>6 首原创合成氛围示例可离线播放。音乐库支持网易云兼容服务、iTunes 试听和本地音频。心情频道用于场景配色，不包含 Sony 的 12 Tone Analysis。</p><div class="shortcuts"><span>播放 / 暂停 <kbd>Space</kbd></span><span>上一首 / 下一首 <kbd>← →</kbd></span><span>显示 / 隐藏界面 <kbd>H</kbd></span><span>全屏 <kbd>F</kbd></span><span>音乐库 <kbd>L</kbd></span><span>关闭窗口 <kbd>Esc</kbd></span></div><p class="panel-note">非 Sony 官方产品。SensMe 商标归其各自所有者所有。</p></dialog>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const player = $('player');
const audio = new AudioEngine();
audio.audio.hidden = true;
audio.audio.setAttribute('aria-label', '当前音频');
player.append(audio.audio);
let scene: SensMeScene | undefined;
let queue: Track[] = [];
let localTracks: Track[] = [];
let searchResults: Track[] = [];
let demoTracks: Track[] = [];
let selectedIndex = 0;
let tab = 'queue';
let shuffled = false;
let repeat: 'all' | 'one' | 'off' = 'all';
let favoritesOnly = false;
let favorites = new Set<string>();
try { const saved = JSON.parse(localStorage.getItem('senseme.favorites') || '[]'); if (Array.isArray(saved)) favorites = new Set(saved.filter(v => typeof v === 'string')); } catch { /* Storage may be unavailable. */ }
let state: AudioEngineState = { playing: false, playbackRequested: false, loading: false, currentTime: 0, duration: 32, volume: 0.65, preview: false };
let searchRequest = 0;
let searchAbort: AbortController | undefined;
let toastTimer: number;
let activeMood = 'energetic';
let oldVolume = 0.65;
let trackCopyTimer: number | undefined;
let trackCopyVersion = 0;
const TRACK_COPY_HOLD_MS = 240;
const TRACK_COPY_FADE_OUT_MS = 150;
const keyOf = (track: Track) => `${track.source}:${track.id}`;
const time = (s: number) => { const n = Math.max(0, Math.floor(Number.isFinite(s) ? s : 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const sourceName = (track?: Track) => track?.source === 'local' ? '本地音乐' : track?.source === 'itunes' ? 'iTunes 试听' : track?.source === 'netease' ? '网易云音乐' : '原创示例';
function toast(message: string) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = window.setTimeout(() => $('toast').hidden = true, 5500); }
async function request<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal: signal ?? AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok) {
    const code = data?.error?.code;
    if (code === 'provider_not_configured' || code === 'netease_not_configured') throw new Error('网易云服务未配置，请切换 iTunes 试听或导入本地音乐。');
    if (code === 'upstream_timeout') throw new Error('音乐服务响应超时，请重试或切换音源。');
    throw new Error(data?.error?.message || '音乐服务暂时不可用。');
  }
  return data as T;
}
try { scene = new SensMeScene($('scene'), { onSelect: (index, direction, offset) => selectTrack(index, true, direction, offset), onError: message => toast(message) }); }
catch { $('scene-error').hidden = false; $('scene-error').textContent = '此浏览器无法启动 WebGL 3D 场景。请开启硬件加速或使用支持 WebGL 2 的浏览器；音乐播放仍可使用。'; }

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function updateTrackContext(track: Track) {
  $('track-position').textContent = `${String(selectedIndex + 1).padStart(2, '0')} / ${String(queue.length).padStart(2, '0')}`;
  $('source-label').textContent = sourceName(track);
  $('favorite').setAttribute('aria-pressed', String(favorites.has(keyOf(track))));
  document.title = `${track.title} · SenseMe`;
}
function updateTrackCopy(track: Track) {
  $('track-title').textContent = track.title || '未知歌曲';
  $('track-artist').textContent = `${track.artist || '未知歌手'} / ${track.album || '未知专辑'}`;
}
function showTrackImmediately(track: Track) {
  const version = ++trackCopyVersion;
  if (trackCopyTimer !== undefined) { window.clearTimeout(trackCopyTimer); trackCopyTimer = undefined; }
  const panel = $('now-playing');
  panel.classList.add('track-copy-immediate');
  panel.classList.remove('track-copy-fade-out');
  updateTrackContext(track);
  updateTrackCopy(track);
  window.requestAnimationFrame(() => { if (version === trackCopyVersion) panel.classList.remove('track-copy-immediate'); });
}
function animateTrackCopy(track: Track) {
  const version = ++trackCopyVersion;
  if (trackCopyTimer !== undefined) { window.clearTimeout(trackCopyTimer); trackCopyTimer = undefined; }
  const panel = $('now-playing');
  panel.classList.remove('track-copy-immediate');
  if (prefersReducedMotion()) {
    panel.classList.remove('track-copy-fade-out');
    updateTrackCopy(track);
    return;
  }
  // Keep the old copy readable through the first ~0.24s, then use the
  // original 150ms fade-out and 300ms fade-in timing for the replacement.
  panel.classList.remove('track-copy-fade-out');
  trackCopyTimer = window.setTimeout(() => {
    if (version !== trackCopyVersion) return;
    panel.classList.add('track-copy-fade-out');
    trackCopyTimer = window.setTimeout(() => {
      if (version !== trackCopyVersion) return;
      trackCopyTimer = undefined;
      updateTrackCopy(track);
      panel.classList.remove('track-copy-fade-out');
    }, TRACK_COPY_FADE_OUT_MS);
  }, TRACK_COPY_HOLD_MS);
}
async function setQueue(tracks: Track[], index = 0, autoplay = false) {
  if (!tracks.length) { toast('没有可播放的歌曲。'); return; }
  queue = tracks; selectedIndex = index;
  scene?.setTracks(queue, index); showTrackImmediately(queue[index]); renderList();
  await audio.load(queue[index], autoplay).catch(() => {});
}
function selectTrack(index: number, autoplay = state.playbackRequested, direction?: number, offset?: number) {
  if (!queue.length) return;
  const next = (index + queue.length) % queue.length;
  const delta = direction ?? (next >= selectedIndex ? 1 : -1);
  const trackChanged = next !== selectedIndex;
  selectedIndex = next; scene?.select(next, direction ?? (trackChanged?delta:undefined), offset); updateTrackContext(queue[next]);
  if (trackChanged) animateTrackCopy(queue[next]); else showTrackImmediately(queue[next]);
  renderList();
  void audio.load(queue[next], autoplay).catch(() => {});
}
function advance(direction: number, autoplay = state.playbackRequested) {
  if (!queue.length) return;
  let index = selectedIndex + direction;
  if (shuffled && queue.length > 1) index = (selectedIndex + 1 + Math.floor(Math.random() * (queue.length - 1))) % queue.length;
  selectTrack(index, autoplay, direction);
}
function updateAudioUI(s: AudioEngineState) {
  state = s;
  const seek = $<HTMLInputElement>('seek'); seek.max = String(s.duration || 1); seek.value = String(s.currentTime); seek.disabled = !s.duration;
  seek.style.setProperty('--progress', `${s.duration ? s.currentTime / s.duration * 100 : 0}%`);
  $('elapsed').textContent = time(s.currentTime); $('duration').textContent = time(s.duration);
  $('play').innerHTML = icon(s.loading ? 'spinner-gap' : s.playing ? 'pause' : 'play');
  $('play').classList.toggle('loading', s.loading);
  $('play').setAttribute('aria-label', s.loading ? '正在载入' : s.playing ? '暂停' : '播放');
  $('source-label').textContent = `${sourceName(queue[selectedIndex])}${s.preview && queue[selectedIndex]?.source !== 'itunes' ? ' · 试听' : ''}`;
  $<HTMLInputElement>('volume').value = String(s.volume);
  $('mute').innerHTML = icon(s.volume === 0 ? 'speaker-slash' : 'speaker-high');
  $('mute').setAttribute('aria-label', s.volume === 0 ? '取消静音' : '静音');
  scene?.setPlaying(s.playing);
  scene?.setPlaybackRequested(s.playbackRequested);
}
audio.addEventListener('state', event => updateAudioUI((event as CustomEvent<AudioEngineState>).detail));
audio.addEventListener('error', event => toast((event as CustomEvent<string>).detail));
audio.addEventListener('notice', event => toast((event as CustomEvent<string>).detail));
audio.addEventListener('ended', () => {
  if (repeat === 'one') { audio.seek(0); void audio.play().catch(() => {}); }
  else if (repeat === 'all' || shuffled || selectedIndex < queue.length - 1) advance(1, true);
});
audio.setVolume(0.65);
let frame = 0;
function tick() { scene?.setEnergy(audio.getEnergy()); frame = requestAnimationFrame(tick); }
frame = requestAnimationFrame(tick);

$('play').onclick = () => void audio.toggle().catch(() => {});
$('previous').onclick = () => advance(-1);
$('next').onclick = () => advance(1);
$('seek').addEventListener('input', () => audio.seek(Number($<HTMLInputElement>('seek').value)));
$('volume').addEventListener('input', () => { const v = Number($<HTMLInputElement>('volume').value); if (v > 0) oldVolume = v; audio.setVolume(v); });
$('mute').onclick = () => audio.setVolume(state.volume > 0 ? 0 : oldVolume);
$('shuffle').onclick = () => { shuffled = !shuffled; $('shuffle').setAttribute('aria-pressed', String(shuffled)); toast(shuffled ? '随机播放已开启' : '顺序播放'); };
$('repeat').onclick = () => { repeat = repeat === 'all' ? 'one' : repeat === 'one' ? 'off' : 'all'; const label = { all: '列表循环', one: '单曲循环', off: '播放到列表结尾停止' }[repeat]; $('repeat').innerHTML = icon(repeat === 'one' ? 'repeat-once' : 'repeat'); $('repeat').classList.toggle('inactive', repeat === 'off'); $('repeat').setAttribute('aria-label', `循环模式：${label}`); $('repeat').title = label; toast(label); };
 $('favorite').onclick = () => { const track = queue[selectedIndex]; if (!track) return; const k = keyOf(track); if (favorites.has(k)) favorites.delete(k); else favorites.add(k); try { localStorage.setItem('senseme.favorites', JSON.stringify([...favorites])); } catch { /* Session-only favorites still work. */ } updateTrackContext(track); renderList(); };

let dialogTrigger: HTMLElement | null = null;
function openDialog(id: string) { dialogTrigger = document.activeElement as HTMLElement; document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(d => d.close()); $<HTMLDialogElement>(id).showModal(); scene?.setBrowsing(id === 'library'); }
document.querySelectorAll<HTMLDialogElement>('dialog').forEach(d => { d.querySelector('.close-dialog')?.addEventListener('click', () => d.close()); d.addEventListener('click', event => { if (event.target === d) { const r = d.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) d.close(); } }); d.addEventListener('close', () => { scene?.setBrowsing($<HTMLDialogElement>('library').open); if (!document.querySelector('dialog[open]')) dialogTrigger?.focus(); }); });
function setTab(nextTab: string) { tab = nextTab; favoritesOnly = false; $('favorites-button').setAttribute('aria-pressed', 'false'); document.querySelectorAll<HTMLElement>('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab))); $('search-section').hidden = tab !== 'search'; $('local-section').hidden = tab !== 'local'; renderList(); }
$('library-button').onclick = () => { setTab('queue'); openDialog('library'); };
$('queue-button').onclick = () => { setTab('queue'); openDialog('library'); };
$('about-button').onclick = () => openDialog('about');
document.querySelectorAll<HTMLElement>('[data-tab]').forEach(b => b.onclick = () => setTab(b.dataset.tab!));
function visibleTracks() { const list = tab === 'local' ? localTracks : tab === 'search' ? searchResults : queue; return favoritesOnly ? list.filter(t => favorites.has(keyOf(t))) : list; }
function renderList() {
  const tracks = visibleTracks(); const list = $('track-list'); list.replaceChildren();
  $('list-caption').firstElementChild!.textContent = favoritesOnly ? '已收藏' : tab === 'search' ? '搜索结果' : tab === 'local' ? '本次导入' : '播放列表';
  $('list-count').textContent = `${tracks.length} 首`;
  $('list-notice').textContent = tab === 'queue' && queue.every(t => t.source === 'demo') ? '原创合成氛围示例 · 6 首 / 每首 32 秒。添加自己的音乐，让封面漂浮起来。' : '';
  if (!tracks.length) { const empty = document.createElement('p'); empty.className = 'empty-state'; empty.textContent = favoritesOnly ? '这里还没有收藏的歌曲。' : tab === 'search' ? '搜索一位歌手，开始聆听。' : tab === 'local' ? '你的下一张唱片，会是什么？' : '播放列表为空。'; list.append(empty); return; }
  tracks.forEach((track, index) => {
    const row = document.createElement('button'); row.className = 'track-row';
    const active = queue[selectedIndex] && keyOf(queue[selectedIndex]) === keyOf(track);
    row.classList.toggle('active', Boolean(active)); row.setAttribute('aria-label', `播放 ${track.title}，${track.artist}`); if (active) row.setAttribute('aria-current', 'true');
    row.innerHTML = `<span class="row-number">${active ? icon('speaker-high') : String(index + 1).padStart(2, '0')}</span><img src="${escape(track.cover || '/covers/tide.svg')}" alt="" loading="lazy"/><span class="row-info"><strong>${escape(track.title || '未知歌曲')}</strong><small>${escape(track.artist || '未知歌手')} · ${escape(sourceName(track))}</small></span><span class="row-duration">${track.source === 'itunes' ? '试听' : time(track.duration)}</span>${icon('play')}`;
    const rowImage = row.querySelector('img')!; rowImage.onerror = () => { rowImage.onerror = null; rowImage.src = '/covers/tide.svg'; };
    row.onclick = () => { scene?.setBrowsing(false); if (tab === 'queue' && !favoritesOnly) selectTrack(index, true); else void setQueue([...tracks], index, true); $<HTMLDialogElement>('library').close(); };
    list.append(row);
  });
}
$('favorites-button').onclick = () => { favoritesOnly = !favoritesOnly; $('favorites-button').setAttribute('aria-pressed', String(favoritesOnly)); renderList(); };
$('demo-button').onclick = () => { void setQueue(demoTracks, 0, state.playbackRequested); setTab('queue'); toast('已载入原创氛围示例'); };
$('search-form').onsubmit = async event => {
  event.preventDefault(); const q = $<HTMLInputElement>('search-input').value.trim(); if (!q) return;
  const token = ++searchRequest; searchAbort?.abort(); searchAbort = new AbortController();
  const provider = $<HTMLSelectElement>('provider').value;
  $('list-notice').textContent = '正在搜索…'; $('track-list').setAttribute('aria-busy', 'true');
  try { const data = await request<TrackResponse>(`/api/search?q=${encodeURIComponent(q)}&provider=${provider}`, searchAbort.signal); if (token !== searchRequest) return; searchResults = data.tracks.map(t => ({ ...t, preview: provider === 'itunes' })); renderList(); $('list-notice').textContent = searchResults.length ? (provider === 'itunes' ? 'iTunes 提供短片段试听，歌曲时长以实际片段为准。' : '音乐来自网易云；可播放范围取决于上游授权。') : '没有找到歌曲，试试其他关键词。'; }
  catch (error) { if (token !== searchRequest) return; searchResults = []; renderList(); $('list-notice').textContent = error instanceof Error ? error.message : '搜索失败，请重试。'; }
  finally { if (token === searchRequest) $('track-list').removeAttribute('aria-busy'); }
};
$('provider').addEventListener('change', () => { $('provider-note').textContent = $<HTMLSelectElement>('provider').value === 'itunes' ? 'Apple 提供的免费试听片段，无需登录。' : '网易云公开可用音源；部分歌曲仅提供试听。'; $('playlist-form').hidden = $<HTMLSelectElement>('provider').value !== 'netease'; });
$('playlist-form').onsubmit = async event => { event.preventDefault(); const raw = $<HTMLInputElement>('playlist-input').value.trim(); const id = /^\d+$/.test(raw) ? raw : raw.match(/[?&]id=(\d+)/)?.[1]; if (!id) { toast('请输入网易云歌单链接或数字 ID。'); return; } const button = $('playlist-form').querySelector('button')!; button.disabled = true; button.textContent = '导入中…'; try { const data = await request<TrackResponse>(`/api/playlist/${id}?provider=netease`); if (!data.tracks.length) throw new Error('歌单为空或暂不可访问。'); await setQueue(data.tracks, 0, false); setTab('queue'); toast(data.notice || `已导入 ${data.tracks.length} 首歌曲`); } catch (e) { toast(e instanceof Error ? e.message : '歌单导入失败'); } finally { button.disabled = false; button.textContent = '导入歌单'; } };
async function addLocal(files: File[]) { if (!files.length) return; $('import-button').setAttribute('aria-busy', 'true'); try { const { importLocalFiles } = await import('./audio/importLocal'); const imported = await importLocalFiles(files); if (!imported.length) { toast('没有找到支持的音频文件。'); return; } localTracks.push(...imported); await setQueue([...localTracks], localTracks.length - imported.length, false); setTab('local'); toast(`已添加 ${imported.length} 首本地音乐`); } catch (e) { toast(e instanceof Error ? e.message : '本地文件读取失败'); } finally { $('import-button').removeAttribute('aria-busy'); } }
$('import-button').onclick = () => $<HTMLInputElement>('file-input').click();
$('file-input').onchange = () => { void addLocal(Array.from($<HTMLInputElement>('file-input').files || [])); $<HTMLInputElement>('file-input').value = ''; };
window.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); player.classList.add('dragging'); } });
window.addEventListener('dragleave', e => { if (!e.relatedTarget) player.classList.remove('dragging'); });
window.addEventListener('drop', e => { e.preventDefault(); player.classList.remove('dragging'); if (e.dataTransfer?.files.length) { setTab('local'); openDialog('library'); void addLocal(Array.from(e.dataTransfer.files)); } });

const moods = [
  ['shuffle-all','Shuffle All','彩色散景','shuffle',''],
  ['energetic','Energetic','活力','sun','first-light'],['relax','Relax','放松','leaf','glass'],['mellow','Mellow','舒缓','cloud','drift'],['upbeat','Upbeat','轻快','rainbow','tide'],
  ['lounge','Lounge','休憩','armchair','glass'],['emotional','Emotional','感性','flower','afterglow'],['dance','Dance','律动','waveform','afterglow'],['extreme','Extreme','激昂','lightning','night'],
  ['morning','Morning','清晨','sun-horizon','first-light'],['day','Daytime','日间','sun-dim','tide'],['evening','Evening','黄昏','sunset','afterglow'],['nightfall','Night','夜晚','star','night'],['night','Midnight','深夜','moon-stars','night'],
];
$('channel-grid').innerHTML = moods.map(([id,name,zh,i,cover]) => `<button class="mood-tile ${id === activeMood ? 'selected' : ''}" data-mood="${id}" aria-label="${name} ${zh}" aria-pressed="${id === activeMood}"${id in NATIVE_BACKGROUNDS ? ` style="--mood-image:url('/reference/${id}.png')"` : cover ? ` style="--mood-image:url('/covers/${cover}.svg')"` : ''}>${icon(i)}<strong>${name}</strong><span>${zh}</span></button>`).join('');
$('channels-button').onclick = () => openDialog('channels');
document.querySelectorAll<HTMLElement>('[data-mood]').forEach(button => button.onclick = () => {
  activeMood = button.dataset.mood!; const mood = moods.find(m => m[0] === activeMood)!; scene?.setMood(activeMood); $('mood-name').textContent = mood[1]; $('channels-button').querySelector('i')!.className = `ph ph-${mood[3]}`;
  document.querySelectorAll<HTMLElement>('[data-mood]').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', String(b === button)); });
  $<HTMLDialogElement>('channels').close();
});
let original = false;
$('view-button').onclick = () => { original = !original; scene?.setQuality(original ? 'original' : 'high'); $('view-button').querySelector('span')!.textContent = original ? 'PSP 画质' : '高清'; $('view-button').setAttribute('aria-label', original ? '切换高清画质' : '切换原始 PSP 画质'); toast(original ? 'PSP 画质 · 渲染分辨率不超过 480 × 272' : '高清画质 · 自适应分辨率'); };
function immersive() { player.classList.toggle('immersive'); }
$('immersive-button').onclick = immersive; $('restore-ui').onclick = immersive;
async function fullscreen() { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { toast('当前环境不支持全屏，请在浏览器中打开。'); } }
$('fullscreen').onclick = () => void fullscreen();
document.addEventListener('fullscreenchange', () => { $('fullscreen').innerHTML = icon(document.fullscreenElement ? 'corners-in' : 'corners-out'); $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '全屏'); });
window.addEventListener('keydown', e => {
  const el = e.target as HTMLElement; if (el.closest('input,select,textarea,[contenteditable="true"]') || document.querySelector('dialog[open]')) return;
  if (e.code === 'Space') { if (el.tagName === 'BUTTON') return; e.preventDefault(); void audio.toggle().catch(() => {}); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); advance(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); advance(-1); }
  else if (e.key.toLowerCase() === 'h') immersive();
  else if (e.key.toLowerCase() === 'f') void fullscreen();
  else if (e.key.toLowerCase() === 'l') { setTab('queue'); openDialog('library'); }
});
try { const data = await request<TrackResponse>('/api/tracks'); demoTracks = data.tracks; await setQueue(demoTracks); }
catch { $('track-title').textContent = '等待音乐服务'; $('track-artist').textContent = '请启动 Node.js 服务，或从音乐库添加本地音乐。'; toast('音乐服务未连接，仍可导入本地音频。'); }
window.addEventListener('beforeunload', () => { cancelAnimationFrame(frame); searchAbort?.abort(); audio.dispose(); scene?.dispose(); releaseLocalTracks(localTracks); });
