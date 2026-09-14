import { ORIGINAL_RENDER, PRESENTATION } from './render-parameters';
import { createSleeveGeometry, updateSleeveGeometry, sleeveHitOpacity } from './sleeve-geometry';
import { AmbientTransition } from './ambient';
import { NATIVE_BACKGROUNDS } from './backgrounds';
import { installReflectionDefocus } from './reflection-defocus';
import { departingSleeve } from './departure';
import { OriginalWaterField, REFLECTED_COVER_ALPHA } from './original-water';
import * as THREE from 'three';
import { skyVertex, skyFragment, waterVertex, waterFragment } from './shaders';
import { sceneViewport, originalPixelRatio, ACTIVE_SLEEVE, BROWSING_SLEEVE, originalRearSleeve, ORIGINAL_ENVIRONMENT_MATRIX } from './layout';
import { incomingProgress, departureProgress, returningProgress, browsingProgress, INCOMING_SECONDS, DEPARTURE_SECONDS } from './motion';

export interface SceneTrack { id: string; title: string; artist: string; cover: string }
export interface SceneOptions { onSelect?: (index: number, direction?: number, offset?: number) => void; onError?: (message: string) => void }
type Pose = { position: THREE.Vector3; scale: number; rotation: number; edge?:number; opacity: number };
type Card = { index: number; group: THREE.Group; face: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; from: Pose; to: Pose; opacity: number; returning?: boolean; returnProgress?: number; returnBase?: Pose; departing: boolean; departureStart: number; placeholder: THREE.Texture };
type Palette = { sky: number; horizon: number; water: number; rainbow: number; bokeh?: number };
const PALETTES: Record<string, Palette> = {
 'shuffle-all': { sky:0x24200e, horizon:0xc72237, water:0x9d233c, rainbow:0, bokeh:1 },
 energetic: { sky: 0x0274d7, horizon: 0xadcfd9, water: 0x729ea6, rainbow: 1 },
 relax: { sky: 0x67abb8, horizon: 0xd4ded1, water: 0x92bcb1, rainbow: .35 },
 mellow: { sky: 0x7c829f, horizon: 0xe3c1be, water: 0xa799ab, rainbow: .1 },
 upbeat: { sky: 0x0289cf, horizon: 0xd5e4d8, water: 0x87b8b7, rainbow: 1 },
 emotional: { sky: 0x777bae, horizon: 0xddc9db, water: 0x929ab2, rainbow: .2 },
 lounge: { sky: 0x7a8caf, horizon: 0xd4d6dd, water: 0x9da9bc, rainbow: .3 },
 dance: { sky: 0x387fd4, horizon: 0xc5cbea, water: 0x7b9dc0, rainbow: .9 },
 extreme: { sky: 0x405f9e, horizon: 0xd5b7c0, water: 0x798c9e, rainbow: .6 },
 evening: { sky: 0x7977a1, horizon: 0xedc7ad, water: 0xa9a2b6, rainbow: .2 },
 morning: { sky: 0x67b7da, horizon: 0xe6e4cf, water: 0xa4c9ca, rainbow: .6 },
 day: { sky: 0x0274d7, horizon: 0xadcfd9, water: 0x729ea6, rainbow: 1 },
 night: { sky: 0x1e355e, horizon: 0x777b99, water: 0x50657f, rainbow: 0 },
};
const clonePose = (p: Pose): Pose => ({ ...p, position: p.position.clone() });

/** PSP-inspired, self-contained rendering engine. Audio and application state live outside. */
export class SensMeScene {
 private readonly container: HTMLElement;
 private readonly options: SceneOptions;
 private readonly renderer: THREE.WebGLRenderer;
 private readonly scene = new THREE.Scene();
 private readonly camera = new THREE.PerspectiveCamera(28.5, 480/272, .1, 500);
 private readonly reflectionCamera = new THREE.PerspectiveCamera();
 private readonly reflection = new THREE.WebGLRenderTarget(1024, 512, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
 private readonly reflectionSky = new THREE.WebGLRenderTarget(1024,512,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false});
 private readonly reflectionMatrix = new THREE.Matrix4();
 private readonly waterField = new OriginalWaterField();
 private readonly waterAbort = new AbortController();
 private readonly nativeBackgrounds: THREE.Texture[] = [];
 private nativeBackgroundsLoaded = 0;
 private readonly loadedBackgrounds = new Map<string,THREE.Texture>();
 private nativeCurrent:THREE.Texture|null=null;
 private nativePrevious:THREE.Texture|null=null;
 private nativeTransitionStart=-10;
 private readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
 private readonly water: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
 private readonly cards = new Map<number, Card>();
 private readonly textureCache = new Map<string, THREE.Texture>();
 private readonly pendingTextures = new Map<string, Promise<THREE.Texture>>();
 private catalogGeneration = 0;
 private readonly textureLoader = new THREE.TextureLoader();
 private readonly raycaster = new THREE.Raycaster();
 private readonly observer: ResizeObserver;
 private tracks: SceneTrack[] = [];
 private selectedIndex = 0;
 private width = 480;
 private height = 272;
 private animation = 0;
 private transitionStart = -10;
 private cursor = 0;
 private elapsed = 0;
 private previousTimestamp = 0;
 private playing = false;
 private browsing = false;
 private playbackRequested = false;
 private presentationTransition: {card:Card;start:number} | null = null;
 private energy = 0;
 private targetEnergy = 0;
 private disposed = false;
 private quality: 'original' | 'high' = 'high';
 private readonly ambient=new AmbientTransition();
 private readonly ambientUniform={value:new THREE.Vector3(245/255,245/255,1)};
 private mood = 'energetic';
 private palette = PALETTES.energetic;
 private pointerStart: {x:number;y:number} | null = null;
 private suppressClickUntil = 0;
 private frames = 0;
 private fallbackTextures = new Set<THREE.Texture>();
 private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

 constructor(container: HTMLElement, options: SceneOptions = {}) {
  this.container = container; this.options = options;
  this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  this.renderer.toneMapping = THREE.NoToneMapping;
  this.renderer.setClearColor(0x96c6de);
  this.renderer.domElement.className = 'sensme-canvas';
  this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;';
  this.renderer.domElement.setAttribute('aria-label', '浮在水面上的唱片封面，点击封面选择歌曲');
  container.appendChild(this.renderer.domElement);
  this.sky = new THREE.Mesh(new THREE.SphereGeometry(220, 32, 20), new THREE.ShaderMaterial({
   vertexShader: skyVertex, fragmentShader: skyFragment, side: THREE.BackSide, depthWrite: false,
   uniforms: { uTime: {value: 0}, uZenith: {value: new THREE.Color(this.palette.sky)}, uHorizon: {value: new THREE.Color(this.palette.horizon)}, uRainbow: {value: 1}, uBokeh: {value: 0}, uEnvironmentProjection: {value:ORIGINAL_ENVIRONMENT_MATRIX.clone()}, uNativeFrom:{value:null}, uNativeTo:{value:null}, uNativeBlend:{value:1}, uNative:{value:0},uMirrorView:{value:0},uViewport:{value:new THREE.Vector2(480,272)} },
  }));
  this.sky.renderOrder = -2; this.sky.frustumCulled = false; this.scene.add(this.sky);
  for(const name of Object.keys(NATIVE_BACKGROUNDS)) {
   const texture=new THREE.TextureLoader().load(`/reference/${name}.png`,loaded=>{
    if(this.disposed)return;
    loaded.colorSpace=THREE.SRGBColorSpace;loaded.minFilter=THREE.LinearFilter;loaded.magFilter=THREE.LinearFilter;loaded.generateMipmaps=false;
    this.nativeBackgroundsLoaded++;this.loadedBackgrounds.set(name,loaded);
   },undefined,()=>{if(!this.disposed)this.options.onError?.('原版背景加载失败');});
   texture.colorSpace=THREE.SRGBColorSpace;
   this.nativeBackgrounds.push(texture);
  }
  this.reflection.depthTexture=new THREE.DepthTexture(1024,512,THREE.UnsignedIntType);
  this.water = new THREE.Mesh(this.waterField.geometry, new THREE.ShaderMaterial({
   vertexShader: waterVertex, fragmentShader: waterFragment, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
   uniforms: { uReflection: {value: this.reflection.texture}, uReflectionMatrix: {value: this.reflectionMatrix} },
  }));
  this.water.renderOrder=-1; this.scene.add(this.water);
  fetch('/water/sensme-height-75x65x65.s8.bin',{signal:this.waterAbort.signal})
   .then(response=>{if(!response.ok)throw new Error('水波数据加载失败');return response.arrayBuffer();})
   .then(buffer=>{if(!this.disposed)this.waterField.setData(buffer);})
   .catch(error=>{if(!this.disposed)this.options.onError?.(error instanceof Error?error.message:'水波数据加载失败');});
  this.textureLoader.setCrossOrigin('anonymous');
  this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(container);
  this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
  this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
  this.renderer.domElement.addEventListener('click', this.onClick);
  this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
  this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
  document.addEventListener('visibilitychange', this.onVisibility);
  this.resize(); this.animation = requestAnimationFrame(this.tick);
 }

 setTracks(tracks: SceneTrack[], selectedIndex = 0) {
  this.presentationTransition=null;
  this.catalogGeneration++; this.pendingTextures.clear();
  for (const card of this.cards.values()) this.destroyCard(card);
  this.cards.clear();
  for (const texture of this.textureCache.values()) texture.dispose();
  this.textureCache.clear();
  this.tracks = tracks;
  this.selectedIndex = tracks.length ? ((selectedIndex%tracks.length)+tracks.length)%tracks.length : 0;
  this.cursor=this.selectedIndex;
  this.arrange(false, 1);
 }
 select(index: number, direction?: number, offset?: number) {
  const count=this.tracks.length;
  if(!count)return;
  const next=((index%count)+count)%count;
  if(next===this.selectedIndex && direction===undefined && !offset)return;
  const sign=direction ?? (next===(this.selectedIndex+count-1)%count?-1:1);
  const step=offset ?? (sign<0 ? -((this.selectedIndex-next+count)%count || count) : ((next-this.selectedIndex+count)%count || count));
  if(!step)return;
  this.presentationTransition=null;
  const outgoing=this.cards.get(this.cursor);
  if(outgoing && step>0) {
   outgoing.returning=false;outgoing.departing=true;outgoing.departureStart=this.elapsed;
   outgoing.from={position:outgoing.group.position.clone(),scale:outgoing.group.scale.x,rotation:outgoing.group.rotation.y,edge:outgoing.group.userData.edge??0,opacity:outgoing.opacity};
   outgoing.to=clonePose(outgoing.from);outgoing.to.opacity=0;
  }
  this.cursor+=step;this.selectedIndex=next;
  // Reuse only this occurrence, never a matching song from the queue tail.
  const returning=this.cards.get(this.cursor);
  let returnProgress=1;
  if(step<0 && returning?.departing) {
   const target=this.poseFor(0);
   if(returning.from.position.distanceTo(target.position)<1e-8 && Math.abs(returning.from.scale-target.scale)<1e-8)
    returnProgress=THREE.MathUtils.clamp((this.elapsed-returning.departureStart)/(this.reducedMotion?.18:DEPARTURE_SECONDS),0,1);
  }
  this.arrange(true,step);
  if(step<0) {
   const incoming=this.cards.get(this.cursor)!;
   incoming.returning=true;incoming.returnBase=clonePose(incoming.to);incoming.returnProgress=returnProgress;incoming.departureStart=this.elapsed;
   const exit=departureProgress(returnProgress);
   this.applyPose(incoming,{...departingSleeve(incoming.to,this.camera,exit),opacity:exit.opacity});
  }
 }

 setMood(mood: string) {
  if(this.mood!==mood.toLowerCase())this.ambient.select(mood.toLowerCase(),this.elapsed);
  this.mood = mood.toLowerCase();
  this.palette = PALETTES[this.mood] ?? PALETTES.energetic;
 }
 setEnergy(value: number) { this.targetEnergy = THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0,0,1); }
 setPlaying(value: boolean) { this.playing = value; }
 setPlaybackRequested(value:boolean) {
  if(this.playbackRequested===value)return;
  this.playbackRequested=value;this.updatePresentation();
 }
 /** Explicit library browsing also uses the smaller Root pose. */
 setBrowsing(value:boolean) {
  if(this.browsing===value)return;
  this.browsing=value;this.updatePresentation();
 }
 private updatePresentation() {
  const card=this.cards.get(this.cursor);
  if(!card || card.departing)return;
  // Change the destination beneath a returning sleeve without replacing its
  // independent reverse-departure clock or fade with the presentation easing.
  card.from=card.returning && card.returnBase ? clonePose(card.returnBase) :
   {position:card.group.position.clone(),scale:card.group.scale.x,rotation:card.group.rotation.y,edge:card.group.userData.edge??0,opacity:card.opacity};
  card.to=this.poseFor(0);
  this.presentationTransition={card,start:this.elapsed};
 }
 setQuality(quality: 'original'|'high') { this.quality = quality; this.resize(); }
 resize() {
  if (this.disposed) return;
  const { width, height } = this.container.getBoundingClientRect();
  this.width=Math.max(1,width); this.height=Math.max(1,height);
  this.renderer.setPixelRatio(this.quality === 'original' ? originalPixelRatio(this.width,this.height) : Math.min(window.devicePixelRatio || 1, 2));
  this.renderer.setSize(this.width,this.height,false);
  const view=sceneViewport(this.width,this.height);
  this.camera.aspect=view.aspect; this.camera.fov=view.fov;
  this.camera.position.set(view.cameraX,view.cameraY,view.cameraZ);
  this.camera.rotation.set(view.rotationX,view.rotationY,view.rotationZ,'XYZ');
  // Original landscape projection; portrait alone uses an off-axis reframe.
  this.camera.setViewOffset(this.width,this.height,0,view.offsetY,this.width,this.height);
  this.camera.updateProjectionMatrix();
  const size = this.quality==='original' ? Math.max(1,Math.floor(this.width*originalPixelRatio(this.width,this.height))) : Math.min(1536,Math.max(768,this.width));
  this.reflection.setSize(Math.round(size),Math.round(size/this.camera.aspect));
  this.reflectionSky.setSize(Math.round(size),Math.round(size/this.camera.aspect));
 }
 getDiagnostics() {
  return { renderer: 'WebGL / Three.js', mood: this.mood, browsing:this.browsing, quality: this.quality, tracks: this.tracks.length, selectedIndex: this.selectedIndex, visibleCovers: this.cards.size, drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, textureCount: this.renderer.info.memory.textures, frames: this.frames, waterFieldLoaded:this.waterField.loaded, waterFrame:this.waterField.currentFrame, nativeBackgroundsLoaded:this.nativeBackgroundsLoaded, size: [this.width,this.height], drawingBuffer: this.renderer.getDrawingBufferSize(new THREE.Vector2()).toArray(), cachedCovers: this.textureCache.size, pendingCovers: this.pendingTextures.size, fallbackCovers: this.fallbackTextures.size, reducedMotion: this.reducedMotion };
 }
 dispose() {
  if (this.disposed) return; this.disposed=true; this.waterAbort.abort(); this.catalogGeneration++; this.pendingTextures.clear();
  cancelAnimationFrame(this.animation); this.observer.disconnect();
  this.renderer.domElement.removeEventListener('pointerdown',this.onPointerDown);
  this.renderer.domElement.removeEventListener('pointerup',this.onPointerUp);
  this.renderer.domElement.removeEventListener('click',this.onClick);
  this.renderer.domElement.removeEventListener('webglcontextlost',this.onContextLost);
  this.renderer.domElement.removeEventListener('webglcontextrestored',this.onContextRestored);
  document.removeEventListener('visibilitychange',this.onVisibility);
  for (const card of this.cards.values()) this.destroyCard(card);
  for (const texture of this.textureCache.values()) texture.dispose();
  for (const texture of this.fallbackTextures) texture.dispose();
  this.textureCache.clear(); this.fallbackTextures.clear(); this.cards.clear();
  for(const texture of this.nativeBackgrounds)texture.dispose();
  this.sky.geometry.dispose(); this.sky.material.dispose(); this.water.geometry.dispose(); this.water.material.dispose(); this.reflection.dispose(); this.reflectionSky.dispose(); this.renderer.dispose();
  this.renderer.domElement.remove();
 }

 private poseFor(slot: number): Pose {
  if(slot===0){
   const sleeve=(this.browsing || !this.playbackRequested) ? BROWSING_SLEEVE : ACTIVE_SLEEVE;
   return {position:new THREE.Vector3(sleeve.x,sleeve.scale*.5,sleeve.z),scale:sleeve.scale,rotation:sleeve.yaw,edge:0,opacity:1};
  }
  const rear=originalRearSleeve(slot-1);
  return {position:new THREE.Vector3(rear.x,rear.y,rear.z),scale:rear.scale,rotation:rear.yaw,edge:ORIGINAL_RENDER.rearEdge*PRESENTATION.rearEdgeScale,opacity:rear.opacity};
 }
 private arrange(animate: boolean, direction: number) {
  const desired = new Set<number>();
  const count=this.tracks.length?1+ORIGINAL_RENDER.rearCoverCount:0;
  for(let slot=0;slot<count;slot++) {
   const occurrence=this.cursor+slot;
   const index=((occurrence%this.tracks.length)+this.tracks.length)%this.tracks.length; desired.add(occurrence);
   const target=this.poseFor(slot);
   let card=this.cards.get(occurrence);
   if(!card) {
    card=this.createCard(index); this.cards.set(occurrence,card);
    const start=clonePose(target);
    if(animate) {start.position.x += slot===0 && direction<0 ? -6 : 4; start.opacity=0;}
    this.applyPose(card,start); card.opacity=start.opacity;
   }
   card.from={position:card.group.position.clone(),scale:card.group.scale.x,rotation:card.group.rotation.y,edge:card.group.userData.edge??0,opacity:card.opacity};
   card.returning=false;card.departing=false;
   card.to=target;
   if(!animate) this.applyPose(card,target);
  }
  for(const [index,card] of this.cards) {
   if(desired.has(index) || card.departing) continue;
   // A sleeve leaving the rear window must not become a seventh rear cover.
   // Foreground left-exit sleeves retain their independent departure animation.
   this.destroyCard(card);this.cards.delete(index);
  }
  // Rapid uninterrupted selection must not accumulate a sleeve for every visited song.
  const leaving=[...this.cards.entries()].filter(([key])=>!desired.has(key)).sort((a,b)=>a[1].opacity-b[1].opacity);
  while(this.cards.size>24 && leaving.length) {
   const [key,card]=leaving.shift()!; this.destroyCard(card); this.cards.delete(key);
  }
  this.transitionStart=animate ? this.elapsed : this.elapsed-2;
 }
 private createCard(index: number): Card {
  const track=this.tracks[index];
  const group=new THREE.Group();
  const placeholder=this.makePlaceholder(track);
  const face=new THREE.Mesh(createSleeveGeometry(),new THREE.MeshBasicMaterial({ map:placeholder, transparent:true, side:THREE.DoubleSide, depthWrite:true, alphaTest:.001 }));
  installReflectionDefocus(face.material,this.ambientUniform);
  face.position.z=0; face.userData.trackIndex=index;
  group.add(face); this.scene.add(group);
  const pose=this.poseFor(0);
  const card:Card={index,group,face,from:clonePose(pose),to:clonePose(pose),opacity:1,departing:false,departureStart:0,placeholder};
  if(track.cover) this.loadCover(track.cover).then(texture=>{
   if(this.disposed || ![...this.cards.values()].includes(card)) {this.pruneTextures();return;}
   face.material.map=texture; face.material.needsUpdate=true; this.pruneTextures();
  }).catch(()=>{ /* Retain the labelled fallback when artwork is unavailable. */ });
  return card;
 }
 private loadCover(url:string):Promise<THREE.Texture> {
  const cached=this.textureCache.get(url);
  if(cached) return Promise.resolve(cached);
  const pending=this.pendingTextures.get(url); if(pending) return pending;
  const generation=this.catalogGeneration;
  // Several songs commonly share one album cover; coalesce their in-flight loads.
  const promise=new Promise<THREE.Texture>((resolve,reject)=>{
   this.textureLoader.load(url,texture=>{
    if(this.disposed || generation!==this.catalogGeneration) {texture.dispose();reject(new Error('Catalog replaced'));return;}
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
    const {width,height}=texture.image;
    if(width>height){texture.repeat.x=height/width;texture.offset.x=(1-texture.repeat.x)/2;}
    else if(height>width){texture.repeat.y=width/height;texture.offset.y=(1-texture.repeat.y)/2;}
    this.textureCache.set(url,texture); resolve(texture);
   },undefined,reject);
  });
  this.pendingTextures.set(url,promise);
  const settled=()=>{if(this.pendingTextures.get(url)===promise)this.pendingTextures.delete(url);};
  promise.then(settled,settled); return promise;
 }
 private pruneTextures() {
  if(this.textureCache.size<=48)return;
  const used=new Set([...this.cards.values()].map(card=>card.face.material.map));
  for(const [url,texture] of this.textureCache) {
   if(this.textureCache.size<=48)break;
   if(!used.has(texture)){texture.dispose();this.textureCache.delete(url);}
  }
 }
 private makePlaceholder(track:SceneTrack) {
  const canvas=document.createElement('canvas'); canvas.width=canvas.height=384;
  const ctx=canvas.getContext('2d')!;
  let hash=0; for(const c of track.id) hash=(hash*31+c.charCodeAt(0))|0;
  const hue=Math.abs(hash)%360;
  const gradient=ctx.createLinearGradient(0,0,384,384); gradient.addColorStop(0,`hsl(${hue},38%,53%)`);gradient.addColorStop(1,`hsl(${(hue+60)%360},33%,17%)`);
  ctx.fillStyle=gradient;ctx.fillRect(0,0,384,384);
  ctx.strokeStyle='rgba(255,255,255,.16)';ctx.lineWidth=1;
  for(let i=0;i<9;i++) {ctx.beginPath();ctx.arc(300,95,40+i*24,0,Math.PI*2);ctx.stroke();}
  ctx.fillStyle='#fff';ctx.font='500 27px sans-serif';ctx.fillText(track.title.slice(0,18),28,296,328);
  ctx.globalAlpha=.72;ctx.font='17px sans-serif';ctx.fillText(track.artist.slice(0,28),28,331,328);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;this.fallbackTextures.add(texture);return texture;
 }
 private applyPose(card:Card,pose:Pose) {
  card.group.userData.edge=pose.edge??0;updateSleeveGeometry(card.face.geometry,pose.edge??0);
  card.group.position.copy(pose.position); card.group.scale.setScalar(pose.scale); card.group.rotation.set(0,pose.rotation,0);
  card.opacity=pose.opacity; card.face.material.opacity=pose.opacity;
  card.group.visible=pose.opacity>.008;
 }
 private destroyCard(card:Card) {
  if(this.presentationTransition?.card===card)this.presentationTransition=null;
  this.scene.remove(card.group); card.placeholder.dispose(); this.fallbackTextures.delete(card.placeholder); card.face.geometry.dispose();card.face.material.dispose();
 }
 private updateCards() {
  for(const [index,card] of this.cards) {
   const duration=this.reducedMotion ? .18 : card.departing ? DEPARTURE_SECONDS : INCOMING_SECONDS;
   const start=(card.departing || card.returning) ? card.departureStart : this.transitionStart;
   const t=THREE.MathUtils.clamp((this.elapsed-start)/duration,0,1);
   if(t===1 && card.to.opacity===0) {this.destroyCard(card);this.cards.delete(index);continue;}
   if(card.returning) {
    const reversed=returningProgress(t,card.returnProgress ?? 1);
    const presentation=this.presentationTransition?.card===card ? this.presentationTransition : null;
    const progress=presentation ? browsingProgress(this.elapsed-presentation.start,this.reducedMotion) : 1;
    const base:Pose={
     position:new THREE.Vector3().lerpVectors(card.from.position,card.to.position,progress),
     scale:THREE.MathUtils.lerp(card.from.scale,card.to.scale,progress),
     rotation:THREE.MathUtils.lerp(card.from.rotation,card.to.rotation,progress),edge:THREE.MathUtils.lerp(card.from.edge??0,card.to.edge??0,progress),opacity:card.to.opacity,
    };
    card.returnBase=base;
    this.applyPose(card,{...departingSleeve(base,this.camera,reversed),edge:base.edge,opacity:base.opacity*reversed.opacity});
    continue;
   }
   const exit=card.departing ? departureProgress(t) : null;
   const presentation=this.presentationTransition?.card===card ? this.presentationTransition : null;
   const eased=exit ? exit.travel : presentation ? browsingProgress(this.elapsed-presentation.start,this.reducedMotion) : incomingProgress(t);
   const geometry=exit ? departingSleeve(card.from,this.camera,exit) : {
    position:new THREE.Vector3().lerpVectors(card.from.position,card.to.position,eased),
    scale:THREE.MathUtils.lerp(card.from.scale,card.to.scale,eased),
    rotation:THREE.MathUtils.lerp(card.from.rotation,card.to.rotation,eased),
   };
   const pose:Pose={...geometry,edge:exit?card.from.edge:THREE.MathUtils.lerp(card.from.edge??0,card.to.edge??0,eased),opacity:exit ? card.from.opacity*exit.opacity : THREE.MathUtils.lerp(card.from.opacity,card.to.opacity,eased)};
   this.applyPose(card,pose);

  }
 }
 private tick = (timestamp:number) => {
  if(this.disposed) return;
  this.animation=requestAnimationFrame(this.tick);
  if(document.hidden) {this.previousTimestamp=timestamp;return;}
  const dt=Math.min(.05,Math.max(0,(timestamp-(this.previousTimestamp||timestamp))/1000));this.previousTimestamp=timestamp;
  this.elapsed+=dt;this.frames++;
  this.energy=THREE.MathUtils.damp(this.energy,this.playing?this.targetEnergy:0,3,dt);
  this.ambientUniform.value.fromArray(this.ambient.sample(this.elapsed,this.reducedMotion));
  this.updateCards();
  const skyU=this.sky.material.uniforms;
  skyU.uTime.value=this.reducedMotion ? 0 : this.elapsed;
  skyU.uZenith.value.lerp(new THREE.Color(this.palette.sky),1-Math.exp(-dt*1.3));
  skyU.uHorizon.value.lerp(new THREE.Color(this.palette.horizon),1-Math.exp(-dt*1.3));
  skyU.uRainbow.value=THREE.MathUtils.damp(skyU.uRainbow.value,this.palette.rainbow,1.3,dt);
  skyU.uBokeh.value=THREE.MathUtils.damp(skyU.uBokeh.value,this.palette.bokeh ?? 0,1.3,dt);
  const native=this.loadedBackgrounds.get(this.mood);
  if(native && native!==this.nativeCurrent) {
   // Keep a bounded two-texture crossfade. On interruption retain the dominant
   // previous endpoint rather than flashing through the procedural fallback.
   this.nativePrevious=skyU.uNativeBlend.value<.5 ? this.nativePrevious : this.nativeCurrent;
   this.nativeCurrent=native;this.nativePrevious??=native;this.nativeTransitionStart=this.elapsed;
  }
  skyU.uNativeFrom.value=this.nativePrevious;skyU.uNativeTo.value=this.nativeCurrent;
  skyU.uNativeBlend.value=this.reducedMotion?1:THREE.MathUtils.clamp((this.elapsed-this.nativeTransitionStart)/.5,0,1);
  skyU.uNative.value=THREE.MathUtils.damp(skyU.uNative.value,native?1:0,1.3,dt);
  this.waterField.update(this.reducedMotion ? 0 : this.elapsed);
  this.renderReflection();
  skyU.uMirrorView.value=0;this.renderer.getDrawingBufferSize(skyU.uViewport.value);
  this.renderer.setRenderTarget(null);this.renderer.render(this.scene,this.camera);
 };
 private renderReflection() {
  this.reflectionCamera.copy(this.camera);
  this.reflectionCamera.position.y=-this.camera.position.y;
  const look=this.camera.getWorldDirection(new THREE.Vector3()).add(this.camera.position);look.y=-look.y;
  const up=new THREE.Vector3(0,1,0).applyQuaternion(this.camera.quaternion);up.y=-up.y;
  this.reflectionCamera.up.copy(up);this.reflectionCamera.lookAt(look);this.reflectionCamera.updateMatrixWorld();
  this.reflectionMatrix.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
  // Original water UVs project the tilted mesh in the main view; the RT
  // contains mirrored sleeves. Reflect the input Y to account for our equivalent
  // mirrored-camera implementation, including its horizontal parity reversal.
  this.reflectionMatrix.multiply(this.reflectionCamera.projectionMatrix).multiply(this.reflectionCamera.matrixWorldInverse).multiply(new THREE.Matrix4().makeScale(1,-1,1));
  this.water.visible=false;
  this.sky.material.uniforms.uMirrorView.value=1;
  this.sky.material.uniforms.uViewport.value.set(this.reflection.width,this.reflection.height);
  // Preserve the actual reflected background behind every fading album pixel.
  // Rendering this separately avoids replacing an album-shaped depth region
  // with a flat water colour when its reflected contribution diminishes.
  const visibleCards=[...this.cards.values()].filter(card=>card.group.visible);
  for(const card of visibleCards)card.group.visible=false;
  this.renderer.setRenderTarget(this.reflectionSky);this.renderer.clear();this.renderer.render(this.scene,this.reflectionCamera);
  for(const card of visibleCards){card.group.visible=true;card.face.material.userData.reflectionPass.value=1;card.face.material.opacity*=REFLECTED_COVER_ALPHA;}
  this.renderer.setRenderTarget(this.reflection);this.renderer.clear();this.renderer.render(this.scene,this.reflectionCamera);
  for(const card of visibleCards){card.face.material.userData.reflectionPass.value=0;card.face.material.opacity/=REFLECTED_COVER_ALPHA;}
  this.water.visible=true;
 }
 private onPointerDown=(event:PointerEvent)=>{this.pointerStart={x:event.clientX,y:event.clientY};};
 private onPointerUp=(event:PointerEvent)=>{
  if(!this.pointerStart)return;
  const dx=event.clientX-this.pointerStart.x,dy=event.clientY-this.pointerStart.y;this.pointerStart=null;
  if(Math.hypot(dx,dy)>9)this.suppressClickUntil=performance.now()+300;
  if(Math.abs(dx)>45 && Math.abs(dx)>Math.abs(dy)*1.4) {if(this.tracks.length)this.options.onSelect?.((this.selectedIndex+(dx<0?1:-1)+this.tracks.length)%this.tracks.length,dx<0?1:-1);return;}
 };
 private onClick=(event:MouseEvent)=>{
  if(performance.now()<this.suppressClickUntil)return;
  const rect=this.renderer.domElement.getBoundingClientRect();
  const pointer=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
  this.raycaster.setFromCamera(pointer,this.camera);
  const hits=this.raycaster.intersectObjects([...this.cards.values()].filter(c=>c.opacity>.008).map(c=>c.face));
  const hit=hits.find(candidate=>sleeveHitOpacity(candidate)>.5);
  const card=hit && [...this.cards.values()].find(candidate=>candidate.face===hit.object);
  // An opaque departing sleeve occludes the queue but is no longer selectable.
  if(card && !card.departing) {
   const occurrence=[...this.cards.entries()].find(([,value])=>value===card)![0];
   const offset=occurrence-this.cursor;
   this.options.onSelect?.(card.index,offset?Math.sign(offset):undefined,offset);
  }
 };
 private onContextLost=(event:Event)=>{event.preventDefault();cancelAnimationFrame(this.animation);this.options.onError?.('3D 画面暂时失去 GPU 连接，浏览器恢复后将自动重绘。');};
 private onContextRestored=()=>{if(!this.disposed){this.previousTimestamp=0;this.animation=requestAnimationFrame(this.tick);}};
 private onVisibility=()=>{this.previousTimestamp=0;};
}
