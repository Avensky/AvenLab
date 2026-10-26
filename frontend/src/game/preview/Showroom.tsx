// No models, textures, HDRIs or network requests. This stage is ready with UI.
export function Showroom({ floor = true }: { floor?: boolean }) {
  return <>
    <color attach="background" args={["#050907"]} />
    <fog attach="fog" args={["#050907", 25, 65]} />
    <hemisphereLight args={["#d8eadd", "#19231c", 0.4]} />
    <directionalLight position={[-6, 8, -4]} color="#f0fff3" intensity={1.2} />
    <directionalLight position={[6, 5, 4]} color="#5bff69" intensity={0.3} />
    <pointLight position={[0, 2.5, -4]} color="#48ff18" intensity={8} distance={14} decay={2} />
    {floor && <ShowroomFloor />}
  </>;
}

export function ShowroomFloor() {
  return <>
    <mesh name="showroom-floor" rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[180, 180]} />
      <meshStandardMaterial color="#172536" roughness={0.9} metalness={0.05} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
      <ringGeometry args={[5.8, 5.83, 80]} /><meshBasicMaterial color="#23526b" />
    </mesh>
  </>;
}
