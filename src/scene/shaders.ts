import { ORIGINAL_RENDER } from './render-parameters';
/** Independently authored shaders. The water samples a separately documented numerical field. */
export const skyVertex = /* glsl */ `
varying vec3 vWorld;
void main() { vec4 world = modelMatrix * vec4(position, 1.0); vWorld = world.xyz; gl_Position = projectionMatrix * viewMatrix * world; }
`;
export const skyFragment = /* glsl */ `
uniform float uTime;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform float uRainbow;
uniform float uBokeh;
uniform mat4 uEnvironmentProjection;
uniform sampler2D uNativeFrom;
uniform sampler2D uNativeTo;
uniform float uNative;
uniform float uNativeBlend;
uniform float uMirrorView;
uniform vec2 uViewport;
varying vec3 vWorld;
float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(.1,.2,.3)); p *= 17.; return fract(p.x * p.y * p.z * (p.x+p.y+p.z)); }
float noise(vec3 p) { vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p) { float f=0.; f+=.52*noise(p); p=p*2.04+5.; f+=.26*noise(p); p=p*2.03+3.; f+=.13*noise(p); p=p*2.01; f+=.065*noise(p); return f; }
// Programme-generated Shuffle All environment. Coordinates follow the PSP
// footage's colour distribution; no sampled frame or album art is used here.
vec3 bokehRegion(vec2 uv,float seed) {
 vec3 red=vec3(.75,.005,.025);
 vec3 pink=vec3(.88,.008,.22);
 vec3 olive=vec3(.055,.075,.009);
 vec3 yellow=vec3(1.,.88,.008);
 vec3 orange=vec3(.98,.26,.003);
 vec3 color=mix(red,pink,smoothstep(.16,.48,uv.x)*.65);
 color=mix(color,mix(orange,yellow,seed),smoothstep(.43,.72,uv.x)*(1.-smoothstep(.45,.70,uv.y)));
 color=mix(color,olive,(1.-smoothstep(.13,.36,uv.x))*(1.-smoothstep(.20,.48,uv.y)));
 color=mix(color,vec3(.008,.73,.82),smoothstep(.85,1.02,uv.x)*smoothstep(.40,.70,uv.y));
 return color;
}
float lightDisc(vec2 uv,vec2 center,float radius,float soft,float phase) {
 vec2 delta=(uv-center)*vec2(480./272.,1.);
 float angle=atan(delta.y,delta.x);
 // Slight aperture facets survive soft focus, as in the recorded light circles.
 float aperture=1.+.045*cos(angle*6.+phase);
 return 1.-smoothstep(radius-soft,radius+soft,length(delta)*aperture);
}
vec3 shuffleAllEnvironment(vec3 direction) {
 // Intersect a virtual far background plane. This preserves a common spatial
 // environment for the main camera and its reflected camera, unlike screen UVs.
 float distanceToPlane=(-18.-cameraPosition.z)/min(direction.z,-.08);
 vec3 environmentPoint=cameraPosition+direction*distanceToPlane;
 vec4 environmentProjection=uEnvironmentProjection*vec4(environmentPoint,1.);
 vec2 uv=environmentProjection.xy/environmentProjection.w*vec2(.5,-.5)+.5;

 vec3 color=vec3(.009,.014,.003);
 color=mix(color,vec3(.63,.003,.025),exp(-dot((uv-vec2(.42,.67))*vec2(1.8,1.4),(uv-vec2(.42,.67))*vec2(1.8,1.4)))*.97);
 color=mix(color,vec3(.95,.47,.002),exp(-dot((uv-vec2(.78,.25))*vec2(2.8,2.5),(uv-vec2(.78,.25))*vec2(2.8,2.5)))*.78*(1.-smoothstep(.42,.62,uv.y)));
 color=mix(color,vec3(.003,.77,.85),exp(-dot((uv-vec2(1.05,.72))*vec2(6.,2.6),(uv-vec2(1.05,.72))*vec2(6.,2.6)))*.9);
 color=mix(color,vec3(.003,.68,.76),exp(-dot((uv-vec2(-.08,.77))*vec2(7.,3.8),(uv-vec2(-.08,.77))*vec2(7.,3.8)))*.83);
 float darkCorner=(1.-smoothstep(.12,.38,uv.x))*(1.-smoothstep(.22,.48,uv.y));
 color=mix(color,vec3(.009,.014,.003),darkCorner*.96);
 // Far lights: many smaller, softer discs with low contrast.
 for(int i=0;i<30;i++) {
  float seed=float(i)+3.;
  vec2 center=vec2(hash(vec3(seed,2.,1.))*1.18-.08,hash(vec3(seed,5.,2.))*1.08-.06);
  center+=vec2(sin(uTime*.051+seed*2.1),cos(uTime*.043+seed*1.7))*.019;
  float radius=.025+hash(vec3(seed,8.,1.))*.065;
  float mask=lightDisc(uv,center,radius,.018,seed);
  color=mix(color,bokehRegion(center,hash(vec3(seed,7.,6.))),mask*.48);
 }
 // Midground aperture shapes retain readable edges rather than becoming fog.
 for(int i=0;i<19;i++) {
  float seed=float(i)+41.;
  vec2 center=vec2(hash(vec3(seed,2.,3.))*1.16-.06,hash(vec3(seed,6.,4.))*.98-.08);
  center+=vec2(sin(uTime*.037+seed),cos(uTime*.033+seed*1.9))*.026;
  float radius=.045+hash(vec3(seed,2.,9.))*.105;
  float mask=lightDisc(uv,center,radius,.010+hash(vec3(seed,4.,1.))*.012,seed);
  color=mix(color,bokehRegion(center,hash(vec3(seed,1.,8.))),mask*.68);
 }
 vec2 drift=vec2(sin(uTime*.035),cos(uTime*.029)-1.)*.014;
 // Large near lights anchor the observed yellow field and central white flare.
 color=mix(color,vec3(.92,.001,.12),lightDisc(uv,vec2(.34,.065)+drift,.185,.014,2.)*.87);
 color=mix(color,vec3(1.,.78,.001),lightDisc(uv,vec2(.83,.16)-drift,.188,.018,4.)*.86);
 color=mix(color,vec3(1.,.94,.009),lightDisc(uv,vec2(.71,.29)+drift,.145,.014,1.)*.80);
 color=mix(color,vec3(.98,.49,.001),lightDisc(uv,vec2(.94,.34)-drift,.13,.013,5.)*.77);
 color=mix(color,vec3(.003,.86,.95),lightDisc(uv,vec2(1.01,.64)+drift,.215,.014,3.)*.89);
 color=mix(color,vec3(.003,.78,.86),lightDisc(uv,vec2(-.075,.74)-drift,.26,.025,5.)*.78);
 color=mix(color,vec3(1.,.98,.84),lightDisc(uv,vec2(.52,.12)+drift,.118,.015,1.)*.88);
 color=mix(color,vec3(1.,1.,.95),lightDisc(uv,vec2(.47,.235)-drift,.095,.011,4.)*.87);
 color=mix(color,vec3(1.,1.,.92),lightDisc(uv,vec2(.56,.018)+drift,.046,.008,2.));
 color=mix(color,vec3(1.,.90,.23),lightDisc(uv,vec2(.60,.29)-drift,.031,.006,2.)*.9);
 // Small upper highlights sit above the large lights so the medium/fine layer
 // remains visible instead of disappearing underneath one opaque white wash.
 for(int i=0;i<14;i++) {
  float seed=float(i)+83.;
  vec2 center=vec2(.23+hash(vec3(seed,3.,1.))*.77,hash(vec3(seed,7.,3.))*.42);
  center+=vec2(sin(uTime*.032+seed),cos(uTime*.041+seed*1.5))*.016;
  float random=hash(vec3(seed,1.,4.));
  float radius=.018+random*.034;
  vec3 accent=mix(bokehRegion(center,random),vec3(1.,.95,.60),smoothstep(.55,.95,random)*.60);
  color=mix(color,accent,lightDisc(uv,center,radius,.006,seed)*.55);
 }
 return color;
}
void main() {
 vec3 dir=normalize(vWorld-cameraPosition);
 float elevation=max(dir.y,0.);
 vec3 col=mix(uHorizon,uZenith,smoothstep(-.06,.15,elevation));
 vec3 p=dir*vec3(7.2,12.,7.2)+vec3(uTime*.006,0.,uTime*.002);
 float cloud=fbm(p); cloud=smoothstep(.53,.76,cloud);
 cloud*=smoothstep(-.015,.10,dir.y)*(1.-smoothstep(.58,.95,dir.y));
 col=mix(col,vec3(.85,.88,.91),cloud*.65);
 // The original rainbow crosses (200,125) -> (350,0) in a 480x272 frame.
 // Keep the lower arc: an off-axis camera sees part of it below world elevation 0.
 col=mix(col,uHorizon,(1.-smoothstep(-.13,-.02,dir.y)));
 float arc=length(vec2(dir.x-.60,dir.y+.60));
 float rainbowBand=exp(-pow((arc-.84)/.026,2.));
 float spectrum=clamp((arc-.804)/.072,0.,1.);
 float hue=(1.-spectrum)*.76;
 vec3 spectrumColor=clamp(abs(fract(hue+vec3(0.,.666667,.333333))*6.-3.)-1.,0.,1.);
 vec3 rainbow=mix(vec3(.86),spectrumColor,.54);
 float atmosphere=smoothstep(-.20,-.08,dir.y);
 float halo=exp(-pow((arc-.84)/.053,2.))*.08;
 col=mix(col,vec3(.84,.88,.93),halo*uRainbow*atmosphere);
 col=mix(col,rainbow,rainbowBand*uRainbow*atmosphere*.48);
 if(uBokeh>.0001)col=mix(col,shuffleAllEnvironment(dir),uBokeh);
 if(uNative>.0001) {
  // The original background is a sprite image, including its lower water field.
  // Both passes sample the same upright screen image. Only mirrored-camera X
  // parity changes; this never turns the upper yellow lights into the water.
  vec2 screen=gl_FragCoord.xy/uViewport;
  if(uMirrorView>.5)screen.x=1.-screen.x;
  // Native sprite: 512 x 304 centred at (240,136) in the 480 x 272
  // viewport. Preserve its 16-pixel overscan instead of fitting the full image.
  vec2 nativeUv=(screen-.5)*vec2(480./512.,272./304.)+.5;
  vec3 nativeColor=mix(texture2D(uNativeFrom,nativeUv).rgb,texture2D(uNativeTo,nativeUv).rgb,uNativeBlend);
  col=mix(col,nativeColor,uNative);
 }
 gl_FragColor=vec4(col,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}
`;
export const waterVertex = /* glsl */ `
uniform mat4 uReflectionMatrix;
attribute vec3 aWaveNormal;
varying vec2 vWaterUv;
void main() {
 vec4 world=modelMatrix*vec4(position,1.);
 vec4 reflected=uReflectionMatrix*world;
 // Original CPU lattice: NDC projection then I=.022 normal distortion, U/4.
 // The reflected camera reverses horizontal parity; WebGL V grows upward.
 vWaterUv=reflected.xy/reflected.w+vec2(${ORIGINAL_RENDER.waterDistortion}*aWaveNormal.x*${ORIGINAL_RENDER.waterHorizontalRatio},${ORIGINAL_RENDER.waterDistortion}*aWaveNormal.z);
 gl_Position=projectionMatrix*viewMatrix*world;
}
`;
export const waterFragment = /* glsl */ `
uniform sampler2D uReflection;
varying vec2 vWaterUv;
vec3 reflected(vec2 uv) { return texture2D(uReflection,clamp(uv,vec2(.002),vec2(.998))).rgb; }
void main() {
 // Only reflected sleeves receive depth-based defocus; main artwork stays sharp.
 // The water only warps and bilinearly samples that completed reflection.
 vec3 color=reflected(vWaterUv);
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}
`;
