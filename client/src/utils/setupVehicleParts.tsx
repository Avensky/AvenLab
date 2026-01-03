// setupVehicleParts.tsx
import React from 'react'
import * as THREE from 'three'
import { sharedGlassMaterial } from './createGlassMaterialFactory';
// import { createGlassMaterialFactory, sharedGlassMaterial } from './createGlassMaterialFactory';


export interface VehiclePartGroup {
    name: string
    parts: string[]
    transparent?: string[]
    opacity?: number
    position?: [number, number, number]
    rotation?: [number, number, number]
    scale?: [number, number, number]
}

export function setupVehicleParts({
    scene,
    groups,
    // camMode,
}: {
    scene: THREE.Group | THREE.Scene
    groups: VehiclePartGroup[]
    // camMode: 'GALLERY' | 'DEFAULT' | 'FIRST_PERSON' | 'BIRD_EYE'
}): {
    clonesByGroup: Record<string, Record<string, THREE.Object3D>>
    // renderedGroups: Record<string, JSX.Element>
    renderedGroups: Record<string, React.JSX.Element>
} {
    const clonesByGroup: Record<string, Record<string, THREE.Object3D>> = {}
    // const renderedGroups: Record<string, JSX.Element> = {}
    const renderedGroups: Record<string, React.JSX.Element> = {}
    // const glassFactory = createGlassMaterialFactory({ opacity: .4, ior: 6.5 });
    // const glassFactory = createGlassMaterialFactory(
    //     camMode === 'FIRST_PERSON'
    //         ? { opacity: 0.1, ior: 1.0 }
    //         : { opacity: 0.4, ior: 6.5 }
    // );
    for (const group of groups) {
        const {
            name,
            parts,
            transparent = [],
            // opacity,
            position,
            rotation,
            scale,
        } = group

        // console.log('opacity', opacity);
        const clonedMap: Record<string, THREE.Object3D> = {}
        const groupRef = React.createRef<THREE.Group>()
        const children: React.JSX.Element[] = []

        const seen = new Set<string>();

        for (const partName of parts) {
            if (seen.has(partName)) continue;
            seen.add(partName);

            const original = scene.getObjectByName(partName);
            if (!original) {
                console.warn(`Part "${partName}" not found in scene`);
                continue;
            }

            const isPartTransparent = transparent.includes(partName); // ✅ FIX: Lock transparency per part
            const cloned = original.clone(true);

            cloned.traverse((node) => {
                if (node instanceof THREE.Mesh) {
                    const mesh = node as THREE.Mesh;

                    const mat = mesh.material;

                    const applyMaterial = (sourceMat: THREE.Material) => {
                        if (isPartTransparent) return sharedGlassMaterial;

                        const clonedMat = sourceMat.clone?.() ?? sourceMat;
                        clonedMat.transparent = false;
                        clonedMat.opacity = 1;
                        clonedMat.depthWrite = true;
                        return clonedMat;
                    };

                    mesh.material = Array.isArray(mat)
                        ? mat.map(applyMaterial)
                        : applyMaterial(mat);

                    mesh.castShadow = true;
                    mesh.receiveShadow = !isPartTransparent;
                }
            });

            children.push(<primitive key={partName} object={cloned} />);
            clonedMap[partName] = cloned;
        }

        clonesByGroup[name] = clonedMap
        renderedGroups[name] = (
            <group
                key={name}
                ref={groupRef}
                name={name}
                position={position}
                rotation={rotation}
                scale={scale}
            >
                {children}
            </group>
        )
    }

    return { clonesByGroup, renderedGroups }
}
