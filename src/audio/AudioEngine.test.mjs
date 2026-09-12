import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const compiled = await build({entryPoints:['src/audio/AudioEngine.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {AudioEngine} = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
globalThis.CustomEvent ??= class extends Event { constructor(type, options) { super(type); this.detail=options.detail; } };
globalThis.window = {};
globalThis.HTMLMediaElement = { HAVE_METADATA:1 };
class Media extends EventTarget {
  paused=true; src=''; currentSrc=''; currentTime=0; duration=32; readyState=0; error=null; calls=0;
  load(){ this.readyState=0; this.dispatchEvent(new Event('loadstart')); }
  ready(){ this.readyState=1; this.dispatchEvent(new Event('loadedmetadata')); }
  pause(){ this.paused=true; this.dispatchEvent(new Event('pause')); }
  play(){ this.calls++; this.paused=false; this.dispatchEvent(new Event('playing')); return this.pending ?? Promise.resolve(); }
}
globalThis.Audio=Media;
const track={id:'test',title:'Test',artist:'Test',album:'Test',cover:'',duration:32,source:'demo',url:'/test.wav'};
function engine(){ const e=new AudioEngine(); const states=[];e.addEventListener('state',ev=>states.push(ev.detail));return {e,states}; }
test('autoplay intent persists through loading, while actual playing stays false',async()=>{
 const {e,states}=engine(); const load=e.load(track,true);
 assert.equal(states.at(-1).playbackRequested,true); assert.equal(states.at(-1).playing,false);
 e.audio.ready();await load;assert.equal(states.at(-1).playing,true);e.dispose();
});
test('pause during loading cancels pending autoplay without aborting metadata',async()=>{
 const {e,states}=engine();const load=e.load(track,true);e.pause();e.audio.ready();await load;
 assert.equal(e.audio.calls,0);assert.equal(states.at(-1).playbackRequested,false);assert.equal(states.at(-1).playing,false);e.dispose();
});
test('late play promise cannot overwrite a more recent pause',async()=>{
 const {e,states}=engine();const load=e.load(track,false);e.audio.ready();await load;
 let resolve;e.audio.pending=new Promise(r=>resolve=r);const play=e.play();e.pause();resolve();await play;
 assert.equal(states.at(-1).playing,false);assert.equal(states.at(-1).playbackRequested,false);e.dispose();
});
test('replacement load supersedes prior autoplay and keeps current selection intent',async()=>{
 const {e,states}=engine();const first=e.load(track,true);const second=e.load({...track,id:'second'},false);
 e.audio.ready();await Promise.all([first,second]);assert.equal(e.audio.calls,0);assert.equal(states.at(-1).playbackRequested,false);e.dispose();
});
