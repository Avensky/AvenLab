// import { useGLTF } from "@react-three/drei";
// import { useEffect } from "react";
// import * as THREE from "three";

// export function GLBAudit({ path }: { path: string }) {
//   const gltf = useGLTF(path);

//   useEffect(() => {
//     let meshes = 0;
//     const materials = new Set<THREE.Material>();
//     let triangles = 0;

//     gltf.scene.traverse((child) => {
//       const mesh = child as THREE.Mesh;

//       if (!mesh.isMesh) return;

//       meshes++;

//       const geom = mesh.geometry;
//       const mat = mesh.material;

//       if (Array.isArray(mat)) {
//         mat.forEach((m) => materials.add(m));
//       } else if (mat) {
//         materials.add(mat);
//       }

//       if (geom.index) {
//         triangles += geom.index.count / 3;
//       } else if (geom.attributes.position) {
//         triangles += geom.attributes.position.count / 3;
//       }
//     });

//     const box = new THREE.Box3().setFromObject(gltf.scene);
//     const size = new THREE.Vector3();
//     box.getSize(size);

//     console.table({
//       path,
//       meshes,
//       materials: materials.size,
//       triangles: Math.round(triangles),
//       sizeX: size.x.toFixed(2),
//       sizeY: size.y.toFixed(2),
//       sizeZ: size.z.toFixed(2),
//     });
//   }, [gltf, path]);

//   return null;
// }