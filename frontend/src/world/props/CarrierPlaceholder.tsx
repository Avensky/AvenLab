import { Shape } from "three";

function outline(points: [number, number][]) {
  const shape = new Shape();
  points.forEach(([x, z], index) => index ? shape.lineTo(x, z) : shape.moveTo(x, z));
  shape.closePath();
  return shape;
}
const hull = outline([[-19, -150], [19, -150], [25, -115], [25, 105], [12, 150], [0, 165], [-12, 150], [-25, 105], [-25, -115]]);
const deck = outline([[-38, -155], [28, -155], [34, -125], [34, 105], [17, 158], [-12, 158], [-32, 105], [-32, -15], [-46, -65]]);

// Fictional, deliberately simple showcase prop. No collision or ship physics.
// Replace this group with an optimized GLB when a final vessel is available.
export function CarrierPlaceholder({ position = [200, 0, 0] }: { position?: [number, number, number] }) {
  return <group name="showcase-carrier-placeholder" position={position}>
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 10, 0]}>
      <extrudeGeometry args={[hull, { depth: 21, bevelEnabled: false }]} />
      <meshStandardMaterial color="#50616b" roughness={0.85} />
    </mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 13, 0]}>
      <extrudeGeometry args={[deck, { depth: 3, bevelEnabled: false }]} />
      <meshStandardMaterial color="#343e46" roughness={0.95} />
    </mesh>
    {/* Angled landing lane, centerline, arresting wires and forward catapults. */}
    <group position={[-8, 13.04, -35]} rotation={[0, -0.11, 0]}>
      {[-10, 10].map(x => <mesh key={x} position={[x, 0, 0]}><boxGeometry args={[0.5, 0.06, 195]} /><meshBasicMaterial color="#d4d8d7" /></mesh>)}
      {Array.from({ length: 12 }, (_, index) => <mesh key={index} position={[0, 0, index * 15 - 82]}><boxGeometry args={[0.45, 0.07, 7]} /><meshBasicMaterial color="#e7c95d" /></mesh>)}
      {[-65, -53, -41].map(z => <mesh key={z} position={[0, 0.04, z]}><boxGeometry args={[26, 0.08, 0.25]} /><meshBasicMaterial color="#b5bec3" /></mesh>)}
    </group>
    {[-9, 8].map(x => <mesh key={x} position={[x, 13.06, 100]}><boxGeometry args={[0.6, 0.06, 88]} /><meshBasicMaterial color="#e7c95d" /></mesh>)}
    {/* Island, bridge glazing, mast and a simple radar panel. */}
    <mesh position={[22, 21, 22]}><boxGeometry args={[14, 16, 42]} /><meshStandardMaterial color="#89979d" /></mesh>
    <mesh position={[22, 32, 25]}><boxGeometry args={[18, 7, 31]} /><meshStandardMaterial color="#a0adb2" /></mesh>
    <mesh position={[22, 32.5, 40.6]}><boxGeometry args={[16, 2.5, 0.2]} /><meshStandardMaterial color="#173f50" metalness={0.3} roughness={0.3} /></mesh>
    <mesh position={[22, 44, 20]}><boxGeometry args={[1.4, 20, 1.4]} /><meshStandardMaterial color="#89979d" /></mesh>
    <mesh position={[22, 49, 20]}><boxGeometry args={[13, 7, 1.2]} /><meshStandardMaterial color="#586a76" /></mesh>
    {/* Parked aircraft silhouettes establish the scale without extra assets. */}
    {[-118, -91, -64, -37].map(z => <group key={z} position={[20, 14.1, z]} rotation={[0, -0.22, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[1.4, 13, 4]} /><meshStandardMaterial color="#9ba9b2" /></mesh>
      <mesh><boxGeometry args={[10, 0.35, 2.8]} /><meshStandardMaterial color="#9ba9b2" /></mesh>
      <mesh position={[0, 1.1, -4.6]}><boxGeometry args={[0.35, 2.3, 2.2]} /><meshStandardMaterial color="#7d8e99" /></mesh>
    </group>)}
  </group>;
}
