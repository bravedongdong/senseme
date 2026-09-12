import * as THREE from 'three';

type SleevePose = { position: THREE.Vector3; scale: number; rotation: number };
type ExitProgress = { travel: number; shrink: number };

/** Project the actual four sleeve corners; bottom is the lowest screen edge. */
export function sleeveScreenBounds(pose:SleevePose,camera:THREE.PerspectiveCamera) {
 const matrix=new THREE.Matrix4().compose(pose.position,new THREE.Quaternion().setFromEuler(new THREE.Euler(0,pose.rotation,0)),new THREE.Vector3().setScalar(pose.scale));
 let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
 for(const x of [-.5,.5])for(const y of [-.5,.5]) {
  const p=new THREE.Vector3(x,y,0).applyMatrix4(matrix).project(camera);
  left=Math.min(left,p.x);right=Math.max(right,p.x);bottom=Math.min(bottom,p.y);top=Math.max(top,p.y);
 }
 return {center:(left+right)*.5,width:right-left,bottom,top};
}

/**
 * Preserve the previously measured leftward screen motion after camera migration.
 * A world-X translation now changes depth and can make a shrinking card appear
 * larger. Solve screen centre/width/contact together, keeping the physical lower
 * edge at its captured water height and retaining the captured yaw.
 */
export function departingSleeve(from:SleevePose,camera:THREE.PerspectiveCamera,exit:ExitProgress):SleevePose {
 if(exit.travel===0&&exit.shrink===0)return {position:from.position.clone(),scale:from.scale,rotation:from.rotation};
 const initial=sleeveScreenBounds(from,camera),contact=from.position.y-from.scale*.5;
 // The former measured projection translates about .87 sleeve widths over
 // its departure, including its perspective. This is a screen-space distance.
 const target=[initial.center-initial.width*.87*exit.travel,initial.width*(1-.18*exit.shrink),initial.bottom];
 const pose={position:from.position.clone(),scale:from.scale*(1-.18*exit.shrink),rotation:from.rotation};
 pose.position.x-=from.scale*(2.6/2.927)*exit.travel;
 const evaluate=()=>{pose.position.y=contact+pose.scale*.5;const b=sleeveScreenBounds(pose,camera);return[b.center,b.width,b.bottom];};
 for(let iteration=0;iteration<8;iteration++) {
  const value=evaluate(),error=target.map((v,i)=>v-value[i]);
  if(Math.max(...error.map(Math.abs))<1e-9)break;
  const base=[pose.position.x,pose.position.z,pose.scale],step=1e-4;
  const columns=base.map((_,i)=>{
   if(i===0)pose.position.x+=step;else if(i===1)pose.position.z+=step;else pose.scale+=step;
   const perturbed=evaluate();pose.position.x=base[0];pose.position.z=base[1];pose.scale=base[2];
   return perturbed.map((v,j)=>(v-value[j])/step);
  });
  const rows=error.map((e,i)=>[columns[0][i],columns[1][i],columns[2][i],e]);
  for(let col=0;col<3;col++) {
   let pivot=col;for(let row=col+1;row<3;row++)if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col]))pivot=row;
   [rows[col],rows[pivot]]=[rows[pivot],rows[col]];
   const divisor=rows[col][col];if(Math.abs(divisor)<1e-12)return {...from,position:from.position.clone()};
   for(let j=col;j<4;j++)rows[col][j]/=divisor;
   for(let row=0;row<3;row++)if(row!==col){const factor=rows[row][col];for(let j=col;j<4;j++)rows[row][j]-=factor*rows[col][j];}
  }
  pose.position.x+=rows[0][3];pose.position.z+=rows[1][3];pose.scale+=rows[2][3];
 }
 pose.position.y=contact+pose.scale*.5;
 return pose;
}
