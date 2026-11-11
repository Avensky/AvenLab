import { DataTexture, DoubleSide, InstancedBufferAttribute, LinearFilter, RedFormat, ShaderMaterial, Vector3 } from "three";
import { AE_HINGE, bytes, lensGeometry, type RoadLensProfile } from "./roadLamps";

function surfaceMaterial(mask?:DataTexture) {
  return new ShaderMaterial({
    uniforms:{hinge:{value:new Vector3(...AE_HINGE)},redMask:{value:mask}},
    defines:mask ? {PROFILE_RED_MASK:1} : {},
    transparent:true,depthWrite:false,side:DoubleSide,forceSinglePass:true,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-3,toneMapped:false,
    vertexShader:`
      uniform vec3 hinge;
      attribute float lensRole;
      attribute vec4 lampState;
      attribute float lift;
      varying vec4 lightColor;
      #ifdef PROFILE_RED_MASK
        varying vec2 lensUV;
        varying float masked;
      #endif
      void main() {
        #ifdef PROFILE_RED_MASK
          lensUV=uv;
          masked=(lensRole==4. || lensRole==8. || lensRole==9.) ? 1. : 0.;
        #endif
        vec3 p=position;
        float night=lampState.x, brake=lampState.y, l=lampState.z, r=lampState.w;
        float code=lensRole;
        vec3 warm=vec3(1.0,.90,.70), amber=vec3(1.0,.31,.018);
        vec4 tail=brake>.5 ? vec4(1.,.018,.009,.93) : vec4(.71,.012,.006,night>.5 ? .42 : 0.);
        lightColor=vec4(0.);
        if(code==1. || code==2.) lightColor=vec4(warm,night>.5 ? .88 : 0.);
        if(code==2.) {
          vec3 d=p-hinge;
          p=hinge+vec3(d.x,cos(lift)*d.y-sin(lift)*d.z,sin(lift)*d.y+cos(lift)*d.z);
        }
        if(code==3.) lightColor=vec4(1.,.60,.19,night==1. ? .78 : 0.);
        if(code==4.) lightColor=tail;
        if(code==5.) lightColor=vec4(1.,.018,.009,brake*.91);
        if(code==6. || code==7.) lightColor=vec4(amber,(code==6. ? l : r)>1.5 ? .92 : 0.);
        if(code==8. || code==9.) {
          float turn=code==8. ? l : r;
          lightColor=turn<.5 ? tail : vec4(1.,.025,.009,turn>1.5 ? .94 : 0.);
        }
        if(code==10.) lightColor=vec4(.89,.81,.63,night>.5 ? .49 : 0.);
        gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(p,1.);
      }`,
    fragmentShader:`
      varying vec4 lightColor;
      #ifdef PROFILE_RED_MASK
        uniform sampler2D redMask;
        varying vec2 lensUV;
        varying float masked;
      #endif
      void main(){
        vec4 lit=lightColor;
        #ifdef PROFILE_RED_MASK
          if(masked>.5) lit.a*=texture2D(redMask,lensUV).r;
        #endif
        if(lit.a<.01) discard;
        gl_FragColor=lit;
        #include <colorspace_fragment>
      }`,
  });
}

/** Shared measured lenses and beam states for road snapshots and garage tests. */
export function prepareRoadLampSurface(profile: RoadLensProfile, capacity: number) {
  const geometry = lensGeometry(profile);
  const state = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  const lift = new InstancedBufferAttribute(new Float32Array(capacity), 1);
  geometry.setAttribute("lampState", state);
  geometry.setAttribute("lift", lift);
  const mask = profile.mask ? new DataTexture(bytes(profile.mask), 128, 128, RedFormat) : undefined;
  if (mask) {
    mask.minFilter = mask.magFilter = LinearFilter;
    mask.needsUpdate = true;
  }
  const material = surfaceMaterial(mask);
  return { geometry, state, lift, material, dispose() {
    geometry.dispose();
    material.dispose();
    mask?.dispose();
  } };
}
