import { ORIGINAL_RENDER } from './render-parameters';
import * as THREE from 'three';

/** Independent equivalent of GE SLOPE selection; see docs/water-reverse.md. */
const floatBits=new DataView(new ArrayBuffer(4));
export function coverDetail(clipW:number,slope:number) {
 floatBits.setFloat32(0,Math.max(0.000001,2*clipW*slope));
 const fixedDetail=((floatBits.getUint32(0)>>>19)&4095)-127*16;
 return Math.max(0,Math.min(2,fixedDetail/16));
}
export function installReflectionDefocus(material:THREE.MeshBasicMaterial,ambient={value:new THREE.Vector3(1,1,1)}) {
 const reflectionPass={value:0};
 material.userData.reflectionPass=reflectionPass;
 material.onBeforeCompile=shader=>{
  shader.uniforms.uReflectionPass=reflectionPass;
  shader.uniforms.uCoverAmbient=ambient;
  shader.vertexShader=`attribute float sleeveAlpha;
uniform float opacity;
uniform float uReflectionPass;
uniform vec3 uCoverAmbient;
varying float vSleeveAlpha;
varying vec3 vSleeveTint;
`+shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
float shade=1.0-0.05*(uv.x+1.0-uv.y);
vSleeveTint=floor(clamp(uCoverAmbient*shade,0.0,1.0)*255.0)/255.0;
float alphaByte=floor(clamp(opacity,0.0,1.0)*255.0);
vSleeveAlpha=(uReflectionPass>.5?alphaByte:floor(alphaByte*sleeveAlpha))/255.0;
`);
  shader.fragmentShader=`uniform float uReflectionPass;
varying float vSleeveAlpha;
varying vec3 vSleeveTint;
vec4 sampleNativeCover(sampler2D cover,vec2 uv) {
 if(uReflectionPass<0.5)return texture2D(cover,uv);
 float delta=max(2.0*${ORIGINAL_RENDER.reflectionFilterDelta}/gl_FragCoord.w,0.000001);
 int fixedDetail=int((floatBitsToUint(delta)>>19u)&4095u)-2032;
 float detail=clamp(float(fixedDetail)/16.0,0.0,2.0);
 // Select the original reflected footprint from the source-resolution mipchain.
 // No canvas resize, replacement artwork, or main-pass resolution limit.
 vec2 size=vec2(textureSize(cover,0));
 float sourceBias=log2(max(1.0,min(size.x,size.y)/256.0));
 float lower=floor(detail);
 float lod0=lower<1.0?0.0:lower+1.0;
 float lod1=min(lower+2.0,3.0);
 return mix(textureLod(cover,uv,lod0+sourceBias),textureLod(cover,uv,lod1+sourceBias),fract(detail));
}
`+shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )','sampleNativeCover( map, vMapUv )')+`
// RGB and alpha were packed to bytes before original triangle interpolation.
diffuseColor.a*=vSleeveAlpha/max(opacity,0.000001);
diffuseColor.rgb=sRGBTransferEOTF(vec4(sRGBTransferOETF(vec4(diffuseColor.rgb,1.0)).rgb*vSleeveTint,1.0)).rgb;
`);
 };
 material.customProgramCacheKey=()=> 'sensme-reflection-defocus-hd-gradation-ambient-edge-bytes-v5';
}

