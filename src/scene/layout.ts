import * as THREE from 'three';
import { ORIGINAL_PARAMETERS as ORIGINAL } from './original-parameters';

/** y=2.5 and a lower edge at y=0 establish a five-unit square. */
export const ACTIVE_SLEEVE = {x:ORIGINAL.front.position[0],scale:5,z:-ORIGINAL.front.position[2],bottom:0,yaw:0} as const;
export const BROWSING_SLEEVE={x:ORIGINAL.root.position[0],scale:5,z:-ORIGINAL.root.position[2],bottom:0,yaw:THREE.MathUtils.degToRad(ORIGINAL.root.angle)} as const;
const rad=THREE.MathUtils.degToRad;
const originalView=new THREE.Matrix4().makeTranslation(ORIGINAL.cameraPos[0],-ORIGINAL.cameraPos[1],ORIGINAL.cameraPos[2])
 .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rad(ORIGINAL.cameraRot[0]),rad(ORIGINAL.cameraRot[1]),0,'YXZ')));
export const ORIGINAL_ENVIRONMENT_MATRIX=new THREE.PerspectiveCamera(ORIGINAL.fov,480/272,.1,1000).projectionMatrix.clone().multiply(originalView);
const originalWorld=originalView.clone().invert();
const originalCameraPosition=new THREE.Vector3().setFromMatrixPosition(originalWorld);
const originalCameraRotation=new THREE.Euler().setFromRotationMatrix(originalWorld,'XYZ');

export function sceneViewport(width:number,height:number) {
 const aspect=width/height,portrait=aspect<1.35;
 const rotationX=originalCameraRotation.x,rotationY=originalCameraRotation.y,rotationZ=originalCameraRotation.z;
 if(!portrait)return {aspect,fov:ORIGINAL.fov,cameraX:originalCameraPosition.x,cameraY:originalCameraPosition.y,cameraZ:originalCameraPosition.z,rotationX,rotationY,rotationZ,offsetY:0};
 // Reframe the same physical album/camera orientation on phones. The original
 // PSP projection is unchanged on landscape; portrait reserves room for controls.
 const coverPixels=Math.min(width*.78,height*.36,Math.max(100,height-440));
 const distance=height/(2*Math.tan(rad(44)/2))*(ACTIVE_SLEEVE.scale/coverPixels)+Math.abs(Math.sin(rotationY))*ACTIVE_SLEEVE.scale*.5;
 const forward=new THREE.Vector3(0,0,-1).applyEuler(originalCameraRotation);
 const center=new THREE.Vector3(ACTIVE_SLEEVE.x,2.5,ACTIVE_SLEEVE.z);
 const camera=center.addScaledVector(forward,-distance);
 const top=Math.max(86,Math.min(height*.18,height-330-coverPixels));
 return {aspect,fov:44,cameraX:camera.x,cameraY:camera.y,cameraZ:camera.z,rotationX,rotationY,rotationZ,offsetY:height*.5-top-coverPixels*.5};
}

/** First Next node followed by locally rotated offset accumulation. */
export function originalRearSleeve(index:number) {
 let x:number=ORIGINAL.next.position[0],z:number=ORIGINAL.next.position[2];
 for(let step=1;step<=index;step++){
  const angle=rad(ORIGINAL.next.angleOffset*step),dx=ORIGINAL.next.offset[0],dz=ORIGINAL.next.offset[2];
  x+=dx*Math.cos(angle)-dz*Math.sin(angle);
  z+=dx*Math.sin(angle)+dz*Math.cos(angle);
 }
 return {x,y:ORIGINAL.next.position[1],z:-z,scale:5,yaw:rad(ORIGINAL.next.angle+ORIGINAL.next.angleOffset*index),opacity:ORIGINAL.next.alpha+ORIGINAL.next.alphaOffset*index};
}

export function originalPixelRatio(width:number,height:number){return Math.min(1,480/width,272/height);}
