import { Quaternion, Vector3 } from "three";
import type { GarageDriverLook } from "./GarageDriver";

type Point = [number, number, number];

function Form({ at, size, color, rotation }: { at: Point; size: Point; color: string; rotation?: Point }) {
  return (
    <mesh position={at} scale={size} rotation={rotation}>
      <sphereGeometry args={[1, 16, 12]} />
      <meshStandardMaterial color={color} roughness={.83} />
    </mesh>
  );
}

function Limb({ from, to, radius, color }: { from: Point; to: Point; radius: number; color: string }) {
  const start = new Vector3(...from), end = new Vector3(...to);
  const direction = end.clone().sub(start);
  const position = start.addScaledVector(direction, .5);
  const height = direction.length();
  const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize());
  return (
    <mesh position={position} quaternion={rotation}>
      <capsuleGeometry args={[radius, Math.max(.01, height - radius * 1.2), 4, 10]} />
      <meshStandardMaterial color={color} roughness={.86} />
    </mesh>
  );
}

// The built-in garage cast uses original geometry and can run without an asset download.
export function StylizedDriver({ look }: { look: GarageDriverLook }) {
  const { female, fabric, skin, hair, appearance, outfit } = look;
  const trim = outfit.trim;
  const shoulders = female ? .155 : .205;
  const crop = appearance.hair === "cropped";
  const hat = appearance.headwear === "hat";
  return (
    <group name={female ? "garage-mara-stylized" : "garage-jules-stylized"}>
      {([-1, 1] as const).map(side => {
        const x = side * .115;
        const knee: Point = [x + side * .017, .49, side * .025];
        const ankle: Point = [x + side * .04, .13, side * .065];
        return <group key={side}>
          <Limb from={[x * .76, .90, 0]} to={knee} radius={.082} color="#222c38" />
          <Limb from={knee} to={ankle} radius={.064} color="#273443" />
          <Form at={[ankle[0], .087, ankle[2] + .052]} size={[.073, .08, .141]} color="#17212b" rotation={[0, side * .11, 0]} />
          <Form at={[ankle[0], .038, ankle[2] + .065]} size={[.074, .033, .137]} color="#384450" />
        </group>;
      })}
      {female ? (
        <mesh position={[0, .658, 0]} scale={[1, 1, .79]}>
          <cylinderGeometry args={[.14, .262, .54, 18]} />
          <meshStandardMaterial color={fabric} roughness={.88} />
        </mesh>
      ) : <Form at={[0, .87, 0]} size={[.185, .132, .112]} color="#222c38" />}
      <Form at={[0, 1.14, 0]} size={[shoulders + .018, .29, .122]} color={fabric} />
      <Form at={[0, 1.13, .114]} size={[.032, .235, .013]} color={female ? trim : "#17212b"} />
      <Form at={[0, .938, .006]} size={[female ? .154 : .19, .044, .119]} color="#282635" />
      {outfit.id !== "dockwear" && outfit.id !== "night-run" &&
        <Form at={[-.09, 1.28, .108]} size={[.049, .026, .012]} color={trim} />}
      <Limb from={[-shoulders, 1.31, 0]} to={[-shoulders - .065, 1.05, -.02]} radius={.067} color={fabric} />
      <Limb from={[-shoulders - .065, 1.05, -.02]} to={[-.125, .956, .112]} radius={.057} color={fabric} />
      <Form at={[-.108, .947, .129]} size={[.048, .045, .047]} color={skin} />
      <Limb from={[shoulders, 1.31, 0]} to={[shoulders + .066, 1.09, .047]} radius={.069} color={fabric} />
      <Limb from={[shoulders + .066, 1.09, .047]} to={[.112, 1.22, .188]} radius={.056} color={fabric} />
      <Form at={[.079, 1.238, .197]} size={[.048, .046, .04]} color={skin} />
      <Form at={[0, 1.428, 0]} size={[.062, .085, .059]} color={skin} />
      <Form at={[0, 1.57, 0]} size={[.104, .143, .1]} color={skin} />
      <Form at={[0, 1.54, .102]} size={[.022, .036, .033]} color={skin} />
      {([-1, 1] as const).map(side => <group key={side}>
        <Form at={[side * .098, 1.554, 0]} size={[.024, .038, .023]} color={skin} />
        <Form at={[side * .043, 1.579, .092]} size={[.020, .008, .012]} color="#241d26" />
        <Form at={[side * .043, 1.602, .093]} size={[.023, .006, .009]} color={hair} rotation={[0, side * .18, side * .1]} />
      </group>)}
      <Form at={[0, 1.496, .089]} size={[.036, .005, .018]} color="#663c37" />
      <Form at={[0, 1.657, -.013]} size={[.106, crop ? .058 : .083, .104]} color={hair} />
      {!crop && female && !hat && <Form at={[0, 1.558, -.062]} size={[.111, .153, .07]} color={hair} />}
      {!crop && !female && !hat && <Form at={[-.019, 1.698, -.015]} size={[.084, .051, .094]} color={hair} rotation={[0, 0, -.18]} />}
      {hat && <>
        <Form at={[0, 1.677, 0]} size={[.115, .087, .108]} color={fabric} />
        <Form at={[0, 1.64, female ? .017 : .101]} size={[female ? .151 : .108, .014, female ? .147 : .122]} color={trim} />
      </>}
    </group>
  );
}
