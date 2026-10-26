// No models, textures, HDRIs or network requests. This stage is ready with UI.
export function Showroom({ floor = true }: { floor?: boolean }) {
  return <>
    <color attach="background" args={["#0d1119"]} />
    <fog attach="fog" args={["#0d1119", 25, 65]} />
    <hemisphereLight args={["#e2e6ed", "#242936", 0.65]} />
    <directionalLight position={[-6, 8, -4]} color="#f0f4ff" intensity={1} />
    <directionalLight position={[6, 5, 4]} color="#d9e2f0" intensity={0.45} />
    {/* Soft neutral spots illuminate the vehicle without washing the room green. */}
    <spotLight name="vehicle-key-spot" position={[3, 6.5, 4]} color="#fff7ec" intensity={95} angle={0.6} penumbra={0.85} distance={18} decay={2} />
    <spotLight name="vehicle-rim-spot" position={[-4, 5.5, -3]} color="#dfebff" intensity={65} angle={0.65} penumbra={0.85} distance={17} decay={2} />
    {floor && <ShowroomFloor />}
  </>;
}

export function ShowroomFloor() {
  return <>
    <mesh name="showroom-floor" rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[180, 180]} />
      <meshStandardMaterial color="#172536" roughness={0.9} metalness={0.05} onBeforeCompile={addShowroomGrid} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
      <ringGeometry args={[5.8, 5.83, 80]} /><meshBasicMaterial color="#23526b" />
    </mesh>
  </>;
}

// Draw the original tiled-line stage in the floor material itself. Derivative
// smoothing keeps the one-metre grid readable without thin-line depth flicker.
function addShowroomGrid(shader: { vertexShader: string; fragmentShader: string }) {
  shader.vertexShader = `varying vec2 vShowroomGrid;\n${shader.vertexShader}`.replace(
    "#include <begin_vertex>",
    "#include <begin_vertex>\nvShowroomGrid = (modelMatrix * vec4(transformed, 1.0)).xz;",
  );
  shader.fragmentShader = `varying vec2 vShowroomGrid;\n${shader.fragmentShader}`.replace(
    "#include <color_fragment>",
    `#include <color_fragment>
    vec2 gridDistance = abs(fract(vShowroomGrid - 0.5) - 0.5) / max(fwidth(vShowroomGrid), vec2(0.0001));
    float gridLine = 1.0 - smoothstep(0.5, 1.25, min(gridDistance.x, gridDistance.y));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.075, 0.12, 0.16), gridLine);`,
  );
}
