// No models, textures, HDRIs or network requests. This stage is ready with UI.
export function Showroom() {
  return <>
    <color attach="background" args={["#07111f"]} />
    <fog attach="fog" args={["#07111f", 25, 85]} />
    <hemisphereLight args={["#cce5ff", "#49535d", 1.5]} />
    <directionalLight position={[-6, 8, -4]} color="#e9f3ff" intensity={3} />
    <directionalLight position={[6, 5, 4]} color="#65cfff" intensity={1.5} />
    <mesh name="showroom-floor" rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[180, 180]} />
      <meshStandardMaterial color="#172536" roughness={0.9} metalness={0.05} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
      <ringGeometry args={[5.8, 5.83, 80]} /><meshBasicMaterial color="#23526b" />
    </mesh>
  </>;
}
