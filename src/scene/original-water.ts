import { ORIGINAL_RENDER, PRESENTATION } from './render-parameters';
import * as THREE from 'three';

export const WATER_GRID = 65;
export const WATER_FRAMES = 75;
export const WATER_LOOP_FRAMES = 60;
export const REFLECTED_COVER_ALPHA = ORIGINAL_RENDER.reflectionAlpha;

/** Independently authored port of the documented numerical water sequence. */
export class OriginalWaterField {
 readonly geometry = new THREE.PlaneGeometry(45, 30, 64, 64);
 readonly normals = new THREE.BufferAttribute(new Float32Array(WATER_GRID * WATER_GRID * 3), 3);
 private readonly heights = new Float32Array(WATER_GRID * WATER_GRID);
 private bytes: Int8Array | null = null;
 private frame = -1;
 private phase = -1;
 constructor() {
  const positions=this.geometry.attributes.position;
  // The source loops from +X to -X and +Z to -Z. Map original Z to -Z.
  for(let i=0;i<positions.count;i++) {
   const x=positions.getX(i),z=positions.getY(i);
   positions.setXYZ(i,-x,0,-z);
   this.normals.setXYZ(i,0,1,0);
  }
  // Original Rx(-8.5 degrees), expressed after the Z-axis conversion.
  this.geometry.rotateX(THREE.MathUtils.degToRad(8.5));
  this.geometry.translate(9.688,0,0);
  this.geometry.setAttribute('aWaveNormal',this.normals);
  this.geometry.computeBoundingSphere();
 }
 setData(buffer:ArrayBuffer) {
  if(buffer.byteLength!==WATER_FRAMES*WATER_GRID*WATER_GRID)throw new Error('原版水波数据尺寸不正确');
  this.bytes=new Int8Array(buffer);this.frame=-1;this.phase=-1;this.update(0);
 }
 get loaded(){return this.bytes!==null;}
 get currentFrame(){return this.frame;}
 update(seconds:number) {
  if(!this.bytes)return;
  // Data frames are independent of display refresh. Interpolate heights before
  // deriving normals so slowing the sequence does not introduce 15 Hz steps.
  const phase=(Math.max(0,seconds)%PRESENTATION.waterLoopSeconds)
   /PRESENTATION.waterLoopSeconds*WATER_LOOP_FRAMES;
  if(phase===this.phase)return;this.phase=phase;
  const frame=Math.floor(phase),next=(frame+1)%WATER_LOOP_FRAMES,mix=phase-frame;
  this.frame=frame;
  const count=WATER_GRID*WATER_GRID;
  const sample=(frame:number,index:number)=>{
   const value=this.bytes![frame*count+index],blend=(frame+1)/15;
   return frame<15?this.bytes![(frame+60)*count+index]*(1-blend)+value*blend:value;
  };
  for(let i=0;i<count;i++) {
   const a=sample(frame,i),b=sample(next,i);
   this.heights[i]=(a+(b-a)*mix)*ORIGINAL_RENDER.waterHeightScale;
  }
  for(let row=0;row<WATER_GRID;row++)for(let col=0;col<WATER_GRID;col++) {
   // Clamp only the outermost neighbours; padded-edge initialization remains
   // unverified. The inner 63×63 lattice follows the original central difference.
   const left=this.heights[row*WATER_GRID+Math.max(0,col-1)];
   const right=this.heights[row*WATER_GRID+Math.min(WATER_GRID-1,col+1)];
   const up=this.heights[Math.max(0,row-1)*WATER_GRID+col];
   const down=this.heights[Math.min(WATER_GRID-1,row+1)*WATER_GRID+col];
   const nx=(left-right)*ORIGINAL_RENDER.waterNormalScale,nz=(up-down)*ORIGINAL_RENDER.waterNormalScale,inv=1/Math.hypot(nx,1,nz);
   this.normals.setXYZ(row*WATER_GRID+col,nx*inv,inv,nz*inv);
  }
  this.normals.needsUpdate=true;
 }
}
