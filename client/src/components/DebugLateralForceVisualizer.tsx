import * as THREE from "three";
import { useMemo } from "react";

interface DebugWheel {
    center: [number, number, number];
    radius: number;
    grounded: boolean;
    lateral_force: [number, number, number];
    lateral_magnitude: number;
}

function lateralColor(f: number) {
    if (f < 300) return "#3a3a3a";
    if (f < 1500) return "#2bff4a";
    if (f < 3000) return "#ffd42b";
    if (f < 6000) return "#ff8c2b";
    return "#ff2b2b";
}

export function DebugLateralForceVisualizer({ wheels }: { wheels: DebugWheel[] }) {
    const geometry = useMemo(
        () => new THREE.CylinderGeometry(0.015, 0.015, 1, 6),
        []
    );

    return (
        <>
            {wheels.map((w, i) => {
                if (!w.grounded || w.lateral_magnitude < 50) return null;

                const dir = new THREE.Vector3(...w.lateral_force);
                const mag = dir.length();
                if (mag < 1e-3) return null;

                dir.normalize();

                // Visual scaling (log keeps it readable)
                const length = Math.log10(mag + 1) * 0.35;


                // const position = new THREE.Vector3(...w.center)
                //     .add(new THREE.Vector3(0, w.radius * 0.15, 0))
                //     .addScaledVector(dir, length * 0.5);

                // const quat = new THREE.Quaternion().setFromUnitVectors(
                //     new THREE.Vector3(0, 1, 0),
                //     dir
                // );

                const origin = new THREE.Vector3(...w.center)
                    .add(new THREE.Vector3(0, w.radius * 0.1, 0));

                // const length = w.lateral_magnitude * scale;
                const arrow = new THREE.ArrowHelper(
                    dir,
                    origin,
                    length,
                    new THREE.Color(lateralColor(w.lateral_magnitude)).getHex(),
                    0.15, // head length
                    0.08  // head width
                );

                return (
                    <primitive key={i} object={arrow} />
                );
            })}
        </>
    );
}



// import * as THREE from "three";

// interface DebugWheel {
//     center: [number, number, number];
//     radius: number;
//     grounded: boolean;
//     lateral_force: [number, number, number];
//     lateral_magnitude: number;
// }

// function lateralColor(f: number) {
//     if (f < 300) return "#3a3a3a";   // negligible
//     if (f < 1500) return "#2bff4a"; // light cornering
//     if (f < 3000) return "#ffd42b"; // normal
//     if (f < 6000) return "#ff8c2b"; // aggressive
//     return "#ff2b2b";               // near slip
// }

// export function DebugLateralForceVisualizer({
//     wheels,
// }: {
//     wheels: DebugWheel[];
// }) {
//     const scale = 0.00012; // N → meters (tune visually)

//     return (
//         <>
//             {wheels.map((w, i) => {
//                 if (!w.grounded || w.lateral_magnitude <= 1) return null;

//                 const origin = new THREE.Vector3(...w.center)
//                     .add(new THREE.Vector3(0, w.radius * 0.1, 0));

//                 const dir = new THREE.Vector3(
//                     ...w.lateral_force
//                 ).normalize();

//                 // const length = w.lateral_magnitude * scale;
//                 const length = Math.log10(w.lateral_magnitude + 1) * 0.25;

//                 const arrow = new THREE.ArrowHelper(
//                     dir,
//                     origin,
//                     length,
//                     new THREE.Color(lateralColor(w.lateral_magnitude)),
//                     0.15,
//                     0.08
//                 );

//                 return <primitive key={i} object={arrow} />;
//             })}
//         </>
//     );
// }
