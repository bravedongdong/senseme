import * as THREE from 'three';
const INDICES=[0, 2, 3, 0, 3, 1, 1, 3, 4, 1, 4, 5, 2, 6, 7, 2, 7, 3, 3, 7, 8, 3, 8, 4, 4, 8, 9, 4, 9, 10, 5, 4, 10, 5, 10, 11, 6, 12, 7, 7, 12, 13, 7, 13, 8, 8, 13, 14, 8, 14, 9, 9, 14, 15, 9, 15, 10, 10, 15, 16, 10, 16, 11, 11, 16, 17, 12, 18, 13, 13, 18, 14, 14, 18, 19, 14, 19, 15, 15, 19, 20, 15, 20, 16, 16, 20, 21, 16, 21, 17, 18, 22, 19, 19, 22, 20, 20, 22, 23, 20, 23, 21];

/** Original 24-vertex planar perimeter. Edge is in normalized cover units. */
export function createSleeveGeometry(){
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(72),3));
 geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(48),2));
 geometry.setAttribute('sleeveAlpha',new THREE.BufferAttribute(new Float32Array(24),1));
 geometry.setIndex(INDICES);updateSleeveGeometry(geometry,0);return geometry;
}
export function updateSleeveGeometry(geometry:THREE.BufferGeometry,edge:number){
 if(geometry.userData.edge===edge)return;
 geometry.userData.edge=edge;
 const rows=[2,4,6,6,4,2],ys=[0,edge,2*edge,1-2*edge,1-edge,1];
 const position=geometry.getAttribute('position'),uv=geometry.getAttribute('uv'),alpha=geometry.getAttribute('sleeveAlpha');
 let index=0;
 for(let row=0;row<6;row++){
  const count=rows[row],inset=(6-count)/2;
  for(let col=0;col<count;col++){
   const step=Math.min(col,count-1-col),x=col<count/2?(inset+col)*edge:1-(inset+count-1-col)*edge,y=ys[row];
   position.setXYZ(index,x-.5,.5-y,0);uv.setXY(index,x,1-y);
   alpha.setX(index,[0,128,255][step]/256);index++;
  }
 }
 position.needsUpdate=true;uv.needsUpdate=true;alpha.needsUpdate=true;
 geometry.computeBoundingSphere();
}

/** Match the interpolated perimeter alpha used by the main render pass. */
export function sleeveHitOpacity(hit:THREE.Intersection){
 const mesh=hit.object as THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>;
 const alpha=mesh.geometry.getAttribute('sleeveAlpha');
 if(!alpha || !hit.face || !hit.barycoord)return mesh.material.opacity;
 const {a,b,c}=hit.face,w=hit.barycoord;
 const alphaByte=Math.floor(Math.max(0,Math.min(1,mesh.material.opacity))*255);
 return (Math.floor(alphaByte*alpha.getX(a))*w.x+Math.floor(alphaByte*alpha.getX(b))*w.y+Math.floor(alphaByte*alpha.getX(c))*w.z)/255;
}
