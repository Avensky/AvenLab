import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import type { LayoutObject } from '../../worldBuilder/document/layoutDocument';

/** Only the water curtain animates. The separate rock terminus owns collision. */
export function ExcavatedWaterfall({ item }: { item: LayoutObject }) {
  const uniforms = useMemo(() => ({ time: { value: 0 } }), []);
  useFrame((_, dt) => { uniforms.time.value = (uniforms.time.value + Math.min(dt, .1)) % 1000; });
  return <mesh position={[item.position[0], item.position[1] + item.size[1] / 2, item.position[2]]}
    rotation={[0, item.yaw * Math.PI / 180, 0]} scale={item.size}>
    <boxGeometry />
    <shaderMaterial uniforms={uniforms} transparent depthWrite={false} toneMapped={false}
      vertexShader={'varying vec3 local; void main(){local=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}'}
      fragmentShader={`uniform float time; varying vec3 local;
        void main(){
          float flow=.5+.5*sin(local.y*58.+time*12.+sin(local.x*93.)*2.);
          float foam=1.-smoothstep(-.5,-.35,local.y);
          vec3 water=mix(vec3(.12,.43,.52),vec3(.65,.87,.9),flow*.55+foam*.45);
          gl_FragColor=vec4(water,.72+flow*.18);
        }`} />
  </mesh>;
}
