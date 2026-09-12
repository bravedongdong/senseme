/** Read-only projection of numeric properties; never loads or executes a PSP module.
 * node scripts/project-original.mjs
 */
import fs from 'node:fs';
import * as THREE from 'three';
const path=process.argv[2] ?? new URL('../docs/references/original-properties.json',import.meta.url);
const properties=JSON.parse(fs.readFileSync(path,'utf8'));
const number=key=>{const n=Number(properties[key]);if(!Number.isFinite(n))throw Error('Invalid '+key);return n;};
const vector=key=>{const value=String(properties[key]).split(',').map(Number);if(value.length!==3||value.some(n=>!Number.isFinite(n)))throw Error('Invalid '+key);return value;};
const rad=THREE.MathUtils.degToRad,[cx,cy,cz]=vector('CameraPos'),[rx,ry,rz]=vector('CameraRot');
const view=new THREE.Matrix4().makeTranslation(cx,-cy,cz).multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rad(rx),rad(ry),rad(rz),'YXZ')));
const camera=new THREE.PerspectiveCamera(number('FOV'),480/272,.1,1000);
camera.matrixWorldInverse.copy(view);camera.matrixWorld.copy(view).invert();
function node(name,index=0,local=true){
 const [x,y,z]=vector(name+'Pos');let px=x,pz=z;
 if(name==='NextNode')for(let i=1;i<=index;i++){
  const [dx,,dz]=vector('NextPosOffset'),angle=local?rad(number('NextAngleOffset')*i):0;
  px+=dx*Math.cos(angle)-dz*Math.sin(angle);pz+=dx*Math.sin(angle)+dz*Math.cos(angle);
 }
 const angle=number(name+'Angle')+(name==='NextNode'?number('NextAngleOffset')*index:0);
 const model=new THREE.Matrix4().compose(new THREE.Vector3(px,y,-pz),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,rad(angle),0)),new THREE.Vector3(5,5,5));
 const vertices=[[-.5,-.5],[.5,-.5],[-.5,.5],[.5,.5]].map(([x,y])=>new THREE.Vector3(x,y,0).applyMatrix4(model).project(camera));
 const bounds=[Math.min(...vertices.map(p=>(p.x+1)*240)),Math.min(...vertices.map(p=>(1-p.y)*136)),Math.max(...vertices.map(p=>(p.x+1)*240)),Math.max(...vertices.map(p=>(1-p.y)*136))];
 return {position:[px,y,-pz].map(n=>+n.toFixed(4)),yaw:angle,bounds:bounds.map(n=>+n.toFixed(2))};
}
console.log(JSON.stringify({source:path,fov:number('FOV'),interpretation:'view = T(x,-y,z) * Euler(cameraRot,YXZ); node=(x,y,-z), same signed node yaw; 5-unit square',cameraWorld:new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld).toArray().map(n=>+n.toFixed(4)),front:node('FrontNode'),root:node('RootNode'),previous:node('PrevNode'),nextLocal:Array.from({length:number('NumNextNode')},(_,i)=>node('NextNode',i)),nextLinearRightEdges:Array.from({length:6},(_,i)=>node('NextNode',i,false).bounds[2]),limitations:['XYZ vs YXZ rotation order differs by less than one reference pixel and is not uniquely identified.','RootNode role and node interpolation code are not exposed by the property table.','Local offset accumulation is a projection-supported inference, not recovered executable code.']},null,2));
