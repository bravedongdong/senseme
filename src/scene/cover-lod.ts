import * as THREE from 'three';

/** Independent equivalent of GE SLOPE selection; see docs/water-reverse.md. */
const floatBits=new DataView(new ArrayBuffer(4));
export function coverDetail(clipW:number,slope:number) {
 floatBits.setFloat32(0,Math.max(0.000001,2*clipW*slope));
 const fixedDetail=((floatBits.getUint32(0)>>>19)&4095)-127*16;
 return Math.max(0,Math.min(2,fixedDetail/16));
}
export function installCoverLod(material:THREE.MeshBasicMaterial) {
 const slope={value:.03};
 material.userData.coverSlope=slope;
 material.onBeforeCompile=shader=>{
  shader.uniforms.uCoverSlope=slope;
  shader.fragmentShader=`uniform float uCoverSlope;
vec4 sampleNativeCover(sampler2D cover,vec2 uv) {
 float delta=max(2.0*uCoverSlope/gl_FragCoord.w,0.000001);
 int fixedDetail=int((floatBitsToUint(delta)>>19u)&4095u)-2032;
 float detail=clamp(float(fixedDetail)/16.0,0.0,2.0);
 // PSP layers are 256, 64, 32: skip the generated 128-pixel level.
 float lower=floor(detail);
 float lod0=lower<1.0?0.0:lower+1.0;
 float lod1=min(lower+2.0,3.0);
 return mix(textureLod(cover,uv,lod0),textureLod(cover,uv,lod1),fract(detail));
}
`+shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )','sampleNativeCover( map, vMapUv )'));
 };
 material.customProgramCacheKey=()=> 'sensme-ge-cover-lod-v2';
}

/** Normalize external artwork to the original runtime's 256-pixel square. */
export function normalizeCoverTexture(texture:THREE.Texture) {
 const picture=texture.image as HTMLImageElement;
 const size=Math.min(picture.width,picture.height);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 const context=canvas.getContext('2d');
 if(!context)throw new Error('Cover canvas unavailable');
 context.drawImage(picture,(picture.width-size)/2,(picture.height-size)/2,size,size,0,0,256,256);
 texture.image=canvas;texture.colorSpace=THREE.SRGBColorSpace;
 texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
 texture.generateMipmaps=true;texture.anisotropy=1;texture.needsUpdate=true;
 return texture;
}
