import * as THREE from "three";
import { useMemo } from "react";

function forceColor(force: number) {
    if (force < 200) return "#3a3a3a";
    if (force < 1500) return "#2bff4a";
    if (force < 3000) return "#ffd42b";
    if (force < 6000) return "#ff8c2b";
    return "#ff2b2b";
}

export function DebugNormalForceVisualizer({
    wheels,
}: {
    wheels: {
        center: [number, number, number];
        radius: number;
        grounded: boolean;
        normal_force: number;
    }[];
}) {
    // const geometry = useMemo(
    //     () => new THREE.CylinderGeometry(0.02, 0.02, 1, 6),
    //     []
    // );
    const normal = new THREE.Vector3(0, 1, 0);

    return (
        <>
            {wheels.map((w, i) => {
                const origin = new THREE.Vector3(...w.center)
                    .addScaledVector(normal, w.radius);
                if (!w.grounded || w.normal_force < 50) return null;

                // const length = Math.log10(w.normal_force + 1) * 0.2;
                const scale = 0.0003;
                const length = w.normal_force * scale;

                // const position = new THREE.Vector3(...w.center)
                //     .add(new THREE.Vector3(0, w.radius + length * 0.5, 0));

                const arrow = new THREE.ArrowHelper(
                    new THREE.Vector3(0, 1, 0),
                    origin,
                    length,
                    new THREE.Color(forceColor(w.normal_force)).getHex(),
                    0.15, // head length
                    0.08  // head width
                );
                return <primitive key={i} object={arrow} />;
                // return (
                //     <mesh
                //         key={i}
                //         geometry={geometry}
                //         position={position}
                //         scale={[1, length, 1]}
                //     >
                //         <meshBasicMaterial
                //             color={forceColor(w.normal_force)}
                //         />
                //     </mesh>

                // );
            })}
        </>
    );
}


// import * as THREE from "three";

// function forceColor(force: number) {
//     if (force < 200) return "#3a3a3a"; // barely touching
//     if (force < 1500) return "#2bff4a"; // light load
//     if (force < 3000) return "#ffd42b"; // normal driving
//     if (force < 6000) return "#ff8c2b"; // heavy load
//     return "#ff2b2b";                   // near limit
// }

// export function DebugNormalForceVisualizer({
//     wheels,
// }: {
//     wheels: {
//         center: [number, number, number];
//         radius: number;
//         grounded: boolean;
//         normal_force: number;
//     }[];
// }) {
//     const normal = new THREE.Vector3(0, 1, 0);

//     return (
//         <>
//             {wheels.map((w, i) => {
//                 if (!w.grounded || w.normal_force <= 0) return null;

//                 const origin = new THREE.Vector3(...w.center)
//                     .addScaledVector(normal, w.radius);

//                 // N → meters (visual scale)
//                 const scale = 0.00015;
//                 const length = w.normal_force * scale;

//                 const arrow = new THREE.ArrowHelper(
//                     normal,
//                     origin,
//                     length,
//                     new THREE.Color(forceColor(w.normal_force)).getHex(),
//                     0.15, // head length
//                     0.08  // head width
//                 );

//                 return (
//                     <primitive
//                         key={i}
//                         object={arrow}
//                         renderOrder={10}
//                     />
//                 );
//             })}
//         </>
//     );
// }
