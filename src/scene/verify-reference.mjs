/** Run: node src/scene/verify-reference.mjs — geometry/math check; no browser or GPU. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';

async function loadSource(name) {
 const result = await build({ entryPoints: [fileURLToPath(new URL(name, import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
 return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const [{ SensMeScene }, { sceneViewport }, { incomingProgress, departureProgress, returningProgress, INCOMING_SECONDS },{departingSleeve,sleeveScreenBounds}] = await Promise.all([
 loadSource('./SensMeScene.ts'), loadSource('./layout.ts'), loadSource('./motion.ts'), loadSource('./departure.ts'),
]);
const scene = Object.create(SensMeScene.prototype);
scene.playbackRequested=true;
const first = scene.poseFor(1), active = scene.poseFor(0);
assert.equal(active.scale,5);assert.equal(active.position.y,2.5);
for(let i=1;i<=6;i++)assert(scene.poseFor(i).position.z>-90,'A rear node enters the far-water fade');
function bounds(pose, width = 480, height = 272) {
 const view = sceneViewport(width, height);
 const camera = new THREE.PerspectiveCamera(view.fov, view.aspect, .1, 500);
 camera.position.set(view.cameraX,view.cameraY,view.cameraZ); camera.rotation.set(view.rotationX,view.rotationY,view.rotationZ,'XYZ');
 camera.setViewOffset(width, height, 0, view.offsetY, width, height); camera.updateMatrixWorld();
 const matrix = new THREE.Matrix4().compose(pose.position,
  new THREE.Quaternion().setFromEuler(new THREE.Euler(0, pose.rotation, 0)), new THREE.Vector3().setScalar(pose.scale));
 const corners = [[-.5,-.5],[.5,-.5],[-.5,.5],[.5,.5]].map(([x,y]) =>
  new THREE.Vector3(x,y,0).applyMatrix4(matrix).project(camera));
 return [Math.min(...corners.map(p => (p.x+1)*width/2)), Math.min(...corners.map(p => (1-p.y)*height/2)),
  Math.max(...corners.map(p => (p.x+1)*width/2)), Math.max(...corners.map(p => (1-p.y)*height/2))];
}
// Visible right edges in the first tile of bilibili-active-display.jpg
// (8:27.2, rectified 480x272). Left edges are occluded and are not measured.
// Manual boundaries carry about 3px image/marking uncertainty; allow 6px.
const measuredRearRight=[251,288,325,360,394,428];
const rearEdgeErrors=measuredRearRight.map((right,i)=>bounds(scene.poseFor(i+1))[2]-right);
assert(rearEdgeErrors.every(error=>Math.abs(error)<6),'Rear queue no longer matches the visible video edges');
console.log(JSON.stringify({reference:'8:27.2 rear right edges',errorPixels:rearEdgeErrors.map(x=>+x.toFixed(2))}));
function interpolate(from, to, progress) {
 return { position: new THREE.Vector3().lerpVectors(from.position,to.position,progress),
  scale: THREE.MathUtils.lerp(from.scale,to.scale,progress), rotation: THREE.MathUtils.lerp(from.rotation,to.rotation,progress) };
}
// Approximate visible/inferred full sleeve bounds from rectified-02..09. The
// initially occluded left edge is inferred from the exposed square silhouette.
const measured = [[178.12,105.89,252.27,182.4],[166.93,99.65,250.24,186.5],[126.24,85.05,244.18,200.88],[108.93,78.78,238.11,208.05],
 [69.19,63.12,230.03,221.37],[45.73,53.71,223.97,228.54],[32.46,48.49,219.94,234.68],[26.34,46.39,217.92,236.73]];
for (let i=0;i<measured.length;i++) {
 const elapsed = i*.1, progress = incomingProgress(elapsed/INCOMING_SECONDS);
 const actual = bounds(interpolate(first,active,progress));
 // The first left edge is hidden behind the foreground and was only inferred;
 // retain the samples as an informational report, not a pixel-fit gate.
 const compared=i===0?[1,2,3]:[0,1,2,3];
 const rms=Math.sqrt(compared.reduce((sum,j)=>sum+(actual[j]-measured[i][j])**2,0)/compared.length);
 // Smooth timing intentionally takes priority over fitting individual video frames.
 console.log(JSON.stringify({elapsed:+elapsed.toFixed(1),progress:+progress.toFixed(3),reference:measured[i],projected:actual.map(Math.round),rms:+rms.toFixed(2)}));
}
// Queue speed must settle continuously, without repeated acceleration spikes.
let lastStep=Infinity;
for(let i=1;i<=100;i++) {
 const step=incomingProgress(i/100)-incomingProgress((i-1)/100);
 assert(step<=lastStep+1e-12,'Queue speed reaccelerates');lastStep=step;
}
assert.equal(incomingProgress(0),0);assert.equal(incomingProgress(1),1);
let previous = 0;
const interrupted = interpolate(first,active,.437);
for (let i=0;i<=1000;i++) {
 const progress = incomingProgress(i/1000);
 assert(progress>=previous-1e-12 && progress>=0 && progress<=1, 'Progress overshoots or reverses');
 const pose = interpolate(interrupted,active,progress);
 const bottom = pose.position.y-pose.scale*.5;
 assert(Math.abs(bottom)<1e-10,'Interpolation lifts the original y=0 contact edge');
 previous=progress;
}
for (const [width,height] of [[480,272],[1280,720],[390,844]]) {
 const actual=bounds(active,width,height);
 assert(actual[0]>=0 && actual[1]>=0 && actual[2]<=width && actual[3]<=height, 'Active sleeve is clipped');
 if(width===390) assert(actual[3]<height-330, 'Mobile sleeve overlaps reserved controls');
 console.log(JSON.stringify({viewport:[width,height],activeBounds:actual.map(Math.round)}));
}
// Validate the reflected camera after migrating from a level camera to the
// original pitch/yaw. The reflected camera reverses X parity; water uses that same projection.
const view=sceneViewport(1280,720),camera=new THREE.PerspectiveCamera(view.fov,view.aspect,.1,500);
camera.position.set(view.cameraX,view.cameraY,view.cameraZ);camera.rotation.set(view.rotationX,view.rotationY,view.rotationZ,'XYZ');camera.updateMatrixWorld();
const mirror=camera.clone();mirror.position.y=-camera.position.y;
const look=camera.getWorldDirection(new THREE.Vector3()).add(camera.position);look.y=-look.y;
const up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);up.y=-up.y;
mirror.up.copy(up);mirror.lookAt(look);mirror.updateMatrixWorld();
for(const point of [new THREE.Vector3(0,0,0),new THREE.Vector3(8,0,-15),new THREE.Vector3(-3,0,10)]) {
 const direct=point.clone().project(camera),reflected=point.clone().project(mirror);
 assert(Math.abs(direct.x+reflected.x)<1e-10 && Math.abs(direct.y-reflected.y)<1e-10 && Math.abs(direct.z-reflected.z)<1e-10,'Reflection contact plane is misregistered');
}
// Departure assertions are about visible geometry, not just decreasing world
// scale. World-X movement with the original yaw previously grew width 169→172.
for(const [width,height] of [[480,272],[1280,720],[390,844]]) {
 const v=sceneViewport(width,height),exitCamera=new THREE.PerspectiveCamera(v.fov,v.aspect,.1,500);
 exitCamera.position.set(v.cameraX,v.cameraY,v.cameraZ);exitCamera.rotation.set(v.rotationX,v.rotationY,v.rotationZ,'XYZ');
 exitCamera.setViewOffset(width,height,0,v.offsetY,width,height);exitCamera.updateMatrixWorld();
 const interrupted=interpolate(first,active,.437);
 for(const from of [active,interrupted]) {
  const initial=sleeveScreenBounds(from,exitCamera);let previous=initial;
  for(let i=0;i<=60;i++) {
   const state=departureProgress(i/120),pose=departingSleeve(from,exitCamera,state),screen=sleeveScreenBounds(pose,exitCamera);
   assert(screen.width<=previous.width+1e-8,'Departing sleeve visually grows');
   assert(screen.center<=previous.center+1e-8,'Departing sleeve reverses horizontal direction');
   assert(Math.abs(screen.bottom-initial.bottom)*height/2<.001,'Departing screen contact edge drifts');
   assert(Math.abs(pose.position.y-pose.scale*.5-(from.position.y-from.scale*.5))<1e-10,'Departure leaves the water plane');
   assert(pose.scale>0&&Number.isFinite(pose.scale),'Departure solver returns invalid scale');
   previous=screen;
  }
 }
 for(const elapsed of [.1,.2]) {
  const state=departureProgress(elapsed/.4),pose=departingSleeve(active,exitCamera,state),projected=bounds(pose,width,height);
  // Intermediate video coordinates are informational after smoothing timing.
  console.log(JSON.stringify({departureElapsed:elapsed,viewport:[width,height],projected:projected.map(x=>+x.toFixed(2)),visibleWidth:+(projected[2]-projected[0]).toFixed(2),opacity:+state.opacity.toFixed(3)}));
 }
}
// Original tilted grid uses main-screen UVs; mirror-camera input Y reflection
// must retain direct Y/depth and reverse only horizontal parity at every height.
for(const point of [new THREE.Vector3(0,2,-15),new THREE.Vector3(8,-2,15)]) {
 const direct=point.clone().project(camera),reflected=new THREE.Vector3(point.x,-point.y,point.z).project(mirror);
 assert(Math.abs(direct.x+reflected.x)<1e-10&&Math.abs(direct.y-reflected.y)<1e-10,'Tilted mesh screen projection is misregistered');
}
const {OriginalWaterField}=await loadSource('./original-water.ts');
const waveBytes=readFileSync(new URL('../../public/water/sensme-height-75x65x65.s8.bin',import.meta.url));
assert.equal(createHash('sha256').update(waveBytes).digest('hex'),'9b9ae52c3febb6323f27d39cc61aeb331f7424d4486fd75244672929756f7c57');
const field=new OriginalWaterField();field.setData(waveBytes.buffer.slice(waveBytes.byteOffset,waveBytes.byteOffset+waveBytes.byteLength));
assert.equal(field.geometry.attributes.position.count,65*65);
const {PRESENTATION}=await loadSource('./render-parameters.ts');
const firstNormals=field.normals.array.slice();
field.update(PRESENTATION.waterLoopSeconds/120);assert.equal(field.currentFrame,0);
assert(field.normals.array.some((value,i)=>Math.abs(value-firstNormals[i])>1e-6),'Subframe water interpolation is static');
field.update(PRESENTATION.waterLoopSeconds/60);assert.equal(field.currentFrame,1);
assert(field.normals.array.some((value,i)=>Math.abs(value-firstNormals[i])>.001),'Wave sequence is static');
field.update(PRESENTATION.waterLoopSeconds);assert.equal(field.currentFrame,0);assert.deepEqual(field.normals.array,firstNormals,'Wave loop does not return to seam frame');
for(let i=0;i<field.normals.count;i++)assert(Math.abs(Math.hypot(field.normals.getX(i),field.normals.getY(i),field.normals.getZ(i))-1)<1e-6,'Wave normal is not normalized');
field.geometry.dispose();
// Exercise the actual public presentation API and update path with GPU-free
// sleeve textures. Audio notifications cannot stand in for a browse transition.
const fixture=Object.create(SensMeScene.prototype);
Object.assign(fixture,{cards:new Map(),textureCache:new Map(),pendingTextures:new Map(),fallbackTextures:new Set(),catalogGeneration:0,
 scene:new THREE.Scene(),camera,elapsed:0,selectedIndex:0,browsing:false,playbackRequested:true,playing:false,reducedMotion:false,departureSequence:0,
 presentationTransition:null,tracks:[],transitionStart:-10,disposed:false});
fixture.makePlaceholder=()=>{const texture=new THREE.Texture();fixture.fallbackTextures.add(texture);return texture;};
const catalog=Array.from({length:30},(_,i)=>({id:String(i),title:`Track ${i}`,artist:'Fixture',cover:''}));
const displayed=()=>{const card=fixture.cards.get(fixture.cursor);return {position:card.group.position.clone(),scale:card.group.scale.x,rotation:card.group.rotation.y};};
const advance=(seconds)=>{fixture.elapsed+=seconds;fixture.updateCards();};
fixture.setTracks(catalog);const frontPose=displayed();
fixture.setPlaying(true);fixture.setPlaying(false);assert.deepEqual(displayed(),frontPose,'Audio pause changes presentation without browsing');
fixture.setBrowsing(true);assert.deepEqual(displayed(),frontPose,'Entering browse jumps before its first update');
advance(.05);const midway=displayed();assert(midway.position.z>3.273&&midway.position.z<10.463);
fixture.setBrowsing(false);fixture.updateCards();assert(midway.position.distanceTo(displayed().position)<1e-10,'Browse reversal resets its start pose');
advance(.08);assert(displayed().position.z>midway.position.z,'Browse reversal moves away from its new target');
fixture.setBrowsing(true);advance(.8);assert(Math.abs(displayed().position.z-3.273)<1e-10,'Browse does not settle at original Root');
for(const [width,height]of[[480,272],[390,844]]) {
 const box=bounds(displayed(),width,height);assert(box[0]>=0&&box[1]>=0&&box[2]<=width&&box[3]<=height,'Root sleeve is clipped');
 console.log(JSON.stringify({presentation:'Root/browsing',viewport:[width,height],bounds:box.map(x=>+x.toFixed(2))}));
}
fixture.select(1);assert.equal(fixture.cards.get(1).to.position.z,3.273,'Browsing selection targets Front');
const departing=[...fixture.cards.values()].find(card=>card.departing),departureStart=departing.departureStart;
advance(.1);const incomingRoot=displayed();fixture.setBrowsing(false);fixture.updateCards();
assert(incomingRoot.position.distanceTo(displayed().position)<1e-10,'Closing browse during incoming selection jumps');
assert.equal(departing.departureStart,departureStart,'Browsing resets an independent departure timer');
advance(.02);const interruptedIncoming=displayed();fixture.select(2);
assert.equal(fixture.presentationTransition,null,'Song change retains the old browsing transition');
assert.equal(fixture.cards.get(2).to.position.z,10.463,'Confirmed song does not target Front');
const justLeft=[...fixture.cards.values()].find(card=>card.departing&&card.index===1);
assert(justLeft.from.position.distanceTo(interruptedIncoming.position)<1e-10,'Selection does not capture the interrupted displayed pose');
advance(.8);assert(Math.abs(displayed().position.z-10.463)<1e-10);
fixture.setBrowsing(true);advance(.03);fixture.setTracks(catalog);
assert.equal(fixture.presentationTransition,null,'Catalog replacement keeps a stale card transition');
assert.equal(displayed().position.z,3.273,'Catalog replacement discards explicit browsing state');
for(let i=0;i<120;i++) {
 fixture.setBrowsing(i%2===0);fixture.select((i+1)%catalog.length);advance(.008);
 assert(fixture.cards.size<=24,'Browsing/selection accumulates departing resources');
 for(const card of fixture.cards.values())assert(Number.isFinite(card.group.position.x)&&card.group.scale.x>0,'Interrupted presentation produces invalid geometry');
}
fixture.reducedMotion=true;fixture.setBrowsing(true);advance(.2);assert(Math.abs(displayed().position.z-3.273)<1e-10);
fixture.setBrowsing(false);advance(.2);assert(Math.abs(displayed().position.z-10.463)<1e-10);
fixture.setTracks([]);assert.equal(fixture.cards.size,0);
console.log('PASS: smooth Front motion, visible departure constraints, Root/browser transitions and interruptions, audio/presentation separation, portrait fit, mirrored water and original wave loop.');


// Previous is the left departure played backwards; the current card retreats.
fixture.reducedMotion=false;fixture.setBrowsing(false);fixture.setPlaybackRequested(true);
for(const count of [1,2,6,7,8,30]) {
 const tracks=catalog.slice(0,count);fixture.setTracks(tracks);
 assert.equal(fixture.cards.size,7,"Visible queue exceeds current + six");
 const front=displayed();fixture.select(count-1,-1);
 const returning=fixture.cards.get(fixture.cursor),retreating=fixture.cards.get(0);
 assert(returning.returning && !retreating.departing);
 assert.equal([...fixture.cards.values()].filter(card=>!card.departing).length,7,"Previous retains an extra rear cover");
 assert(retreating.from.position.distanceTo(front.position)<1e-10);
 advance(.05);
 const queueProgress=retreating.group.position.distanceTo(retreating.from.position)/retreating.to.position.distanceTo(retreating.from.position);
 assert(Math.abs(queueProgress-incomingProgress(.05/INCOMING_SECONDS))<1e-8,'Previous queue starts late');
 assert(Math.abs(returning.opacity-returningProgress(.05/INCOMING_SECONDS).opacity)<1e-8,'Previous fade and queue use different clocks');
 let lastCenter=-Infinity,lastWidth=0;
 for(let frame=0;frame<=40;frame++) {
  fixture.updateCards();const b=sleeveScreenBounds(displayed(),camera);
  assert(b.center>=lastCenter-1e-8,'Previous cover moves left during return');
  assert(b.width>=lastWidth-1e-8,'Previous cover shrinks during return');
  lastCenter=b.center;lastWidth=b.width;advance(.01);
 }
 advance(.4);assert(displayed().position.distanceTo(front.position)<1e-8);
 assert(retreating.group.position.distanceTo(fixture.poseFor(1).position)<1e-8);
 for(let i=0;i<60;i++) {fixture.select(fixture.selectedIndex+(i%2?1:-1),i%2?1:-1);advance(.025);assert(fixture.cards.size<=24);}
 advance(1);assert.equal(fixture.cards.size,7);
}
// Cross the catalog seam repeatedly: the actual next occurrence must advance,
// including when all seven cards refer to one song.
for(const count of [1,2,6,7,8,30]) {
 fixture.setTracks(catalog.slice(0,count),count-1);
 for(let step=0;step<count+2;step++) {
  const cursor=fixture.cursor,front=fixture.cards.get(cursor),next=fixture.cards.get(cursor+1);
  const position=next.group.position.clone();
  fixture.select((fixture.selectedIndex+1)%count,1);fixture.updateCards();
  assert.equal(fixture.cards.get(fixture.cursor),next,'Catalog seam replaces incoming occurrence');
  assert(next.group.position.distanceTo(position)<1e-10,'Catalog seam teleports incoming cover');
  assert(front.departing,'Single-track next skips the outgoing animation');
  assert.equal([...fixture.cards.values()].filter(card=>!card.departing).length,7);
  advance(.8);
  assert.equal(fixture.cards.size,7);
  for(let slot=0;slot<7;slot++)assert.equal(fixture.cards.get(fixture.cursor+slot).index,(fixture.selectedIndex+slot)%count);
 }
}
// Clicking the sixth rear occurrence must run six ordinary next transitions.
for(const count of [1,2,8]) {
 fixture.reducedMotion=false;fixture.setTracks(catalog.slice(0,count));
 const visited=[];
 fixture.options={onSelect:(index,direction,offset)=>{
  const next=fixture.cards.get(fixture.cursor+1),position=next.group.position.clone();
  fixture.select(index,direction,offset);fixture.updateCards();
  assert.equal(fixture.cards.get(fixture.cursor),next,'Rear click skips a queue occurrence');
  assert(next.group.position.distanceTo(position)<1e-10,'Rear click teleports a cover');
  visited.push(fixture.cursor);
 }};
 fixture.selectOccurrence(6);assert.deepEqual(visited,[1]);
 advance(.35);fixture.advanceQueuedSelection();assert.deepEqual(visited,[1]);
 for(let i=0;i<5;i++){advance(.71);fixture.advanceQueuedSelection();}
 assert.deepEqual(visited,[1,2,3,4,5,6]);assert.equal(fixture.queuedCursor,null);
 advance(.8);fixture.selectOccurrence(4);fixture.select(fixture.selectedIndex-1,-1);
 advance(1);fixture.advanceQueuedSelection();assert.equal(fixture.queuedCursor,null,'Manual previous fails to cancel queued click');
}
fixture.options={};
fixture.setTracks(catalog);fixture.setPlaybackRequested(false);advance(1);
assert(Math.abs(displayed().position.z-3.273)<1e-10,'Paused cover is not at Root');
fixture.setPlaying(false);fixture.setPlaybackRequested(true);advance(1);
assert(Math.abs(displayed().position.z-10.463)<1e-10,'Requested playback should retain Front while loading');
fixture.setTracks([]);
console.log('PASS: previous returns from left, current retreats, queue wrap/interruption and play/nonplay poses.');

// Presentation changes must not cancel or restart the previous-song path.
for(const reduced of [false,true]) {
 fixture.reducedMotion=reduced;fixture.setPlaybackRequested(true);fixture.setTracks(catalog);
 fixture.select(29,-1);advance(.06);
 const card=fixture.cards.get(fixture.cursor),start=card.departureStart;
 for(const requested of [false,true,false]) {
  const before=displayed(),alpha=card.opacity;
  fixture.setPlaybackRequested(requested);fixture.updateCards();
  assert(card.returning,'Pause/resume cancels reverse departure');
  assert.equal(card.departureStart,start,'Pause/resume resets reverse departure clock');
  assert(displayed().position.distanceTo(before.position)<1e-8,'Pause/resume jumps returning geometry');
  assert(Math.abs(card.opacity-alpha)<1e-10,'Pause/resume jumps returning opacity');
  advance(.025);
  const expected=returningProgress((fixture.elapsed-start)/(reduced?.18:INCOMING_SECONDS)).opacity;
  assert(Math.abs(card.opacity-expected)<1e-10,'Presentation easing replaces reverse fade');
 }
 advance(1);assert(Math.abs(displayed().position.z-3.273)<1e-10);
}
fixture.setTracks([]);
console.log('PASS: pause/resume during previous preserves geometry continuity, reverse fade and clock in both motion modes.');

// Shared sleeve materials must return to sharp artwork after the reflection pass.
fixture.setTracks(catalog.slice(0,2));
Object.assign(fixture,{
 reflectionCamera:new THREE.PerspectiveCamera(),reflectionMatrix:new THREE.Matrix4(),
 reflection:{width:480,height:272},reflectionSky:{width:480,height:272},
 water:{visible:true},sky:{material:{uniforms:{uMirrorView:{value:0},uViewport:{value:new THREE.Vector2()}}}},
});
const passSamples=[];
fixture.renderer={setRenderTarget(){},clear(){},render(){
 passSamples.push([...fixture.cards.values()].map(card=>({visible:card.group.visible,defocus:card.face.material.userData.reflectionPass.value,opacity:card.face.material.opacity})));
}};
fixture.renderReflection();
assert(passSamples[0].every(card=>!card.visible),'Reflection background includes foreground sleeves');
assert(passSamples[1].every(card=>card.defocus===1),'Reflection sleeves bypass defocus');
for(const card of fixture.cards.values()) {
 assert.equal(card.face.material.userData.reflectionPass.value,0,'Defocus leaks into main artwork');
 assert(Math.abs(card.face.material.opacity-card.opacity)<1e-10,'Reflection opacity leaks into main artwork');
}
fixture.setTracks([]);
console.log('PASS: reflection-only defocus and alpha restore without changing main artwork.');

// All exposed original channel frames exist at their native sprite dimensions.
const {NATIVE_BACKGROUNDS}=await loadSource('./backgrounds.ts');
assert.deepEqual(Object.values(NATIVE_BACKGROUNDS).sort((a,b)=>a-b),Array.from({length:14},(_,i)=>i));
for(const name of Object.keys(NATIVE_BACKGROUNDS)) {
 const png=readFileSync(new URL(`../../public/reference/${name}.png`,import.meta.url));
 assert.equal(png.subarray(1,4).toString(),'PNG');
 assert.equal(png.readUInt32BE(16),512,`${name}: wrong sprite width`);
 assert.equal(png.readUInt32BE(20),304,`${name}: wrong sprite height`);
}
console.log('PASS: all 14 channel backgrounds retain native dimensions and complete frame indexing.');

const {AmbientTransition}=await loadSource('./ambient.ts');
const ambient=new AmbientTransition();
assert.deepEqual(ambient.sample(0),[245/255,245/255,1]);
ambient.select('relax',0);assert.deepEqual(ambient.sample(0),[245/255,245/255,1]);
assert(ambient.sample(2.5).every((value,i)=>Math.abs(value-[245/255,250/255,250/255][i])<1e-12),'Ambient midpoint differs from the original linear blend');
const beforeAmbient=ambient.sample(2.5);ambient.select('upbeat',2.5);
assert.deepEqual(ambient.sample(2.5),beforeAmbient,'Interrupted ambient colour jumps');
assert.deepEqual(ambient.sample(7.5),[1,235/255,1]);
assert.deepEqual(ambient.sample(2.5,true),[1,235/255,1]);
console.log('PASS: original ambient RGB, five-second midpoint/end and interrupted transition.');

const {createSleeveGeometry,updateSleeveGeometry}=await loadSource('./sleeve-geometry.ts');
const sleeve=createSleeveGeometry();
assert.equal(sleeve.getAttribute('position').count,24);assert.equal(sleeve.index.count,102);
for(const edge of [0,.005,.02]) {
 updateSleeveGeometry(sleeve,edge);const p=sleeve.getAttribute('position');let area=0;
 for(let i=0;i<sleeve.index.count;i+=3){const ids=[0,1,2].map(j=>sleeve.index.getX(i+j));const a=new THREE.Vector3().fromBufferAttribute(p,ids[0]),b=new THREE.Vector3().fromBufferAttribute(p,ids[1]),c=new THREE.Vector3().fromBufferAttribute(p,ids[2]);area+=b.sub(a).cross(c.sub(a)).length()/2;}
 assert(Math.abs(area-(1-8*edge*edge))<1e-6,'Feather topology has gaps or overlapping triangles');
 assert.equal(sleeve.getAttribute('sleeveAlpha').getX(0),0);
 assert.equal(sleeve.getAttribute('sleeveAlpha').getX(8),255/256);
}
sleeve.dispose();console.log('PASS: original 24-vertex sleeve topology and planar feather area.');

const {sleeveHitOpacity}=await loadSource('./sleeve-geometry.ts');
const pickGeometry=createSleeveGeometry();updateSleeveGeometry(pickGeometry,.02);
const pickMesh=new THREE.Mesh(pickGeometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide,transparent:true}));pickMesh.updateMatrixWorld();
const picker=new THREE.Raycaster();
for(const [x,expected] of [[0,254/255],[.49,127/510]]){
 picker.set(new THREE.Vector3(x,0,1),new THREE.Vector3(0,0,-1));const hit=picker.intersectObject(pickMesh)[0];
 assert(hit,'Missing sleeve hit');assert(Math.abs(sleeveHitOpacity(hit)-expected)<1e-5,'Picking ignores rendered feather alpha');
}
pickMesh.material.opacity=.4;picker.set(new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1));
assert(sleeveHitOpacity(picker.intersectObject(pickMesh)[0])<.5,'Picking ignores animated fade');
pickGeometry.dispose();pickMesh.material.dispose();
console.log('PASS: sleeve picking respects feather interpolation and animated opacity.');
