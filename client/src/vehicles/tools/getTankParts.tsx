// utils/getTankParts.ts
import type { GLTF } from 'three-stdlib';
import { Group, Object3D } from 'three';

export interface TankParts {
    turret: Group | null;
    cannon: Group | null;
    wheels: Object3D[];
}
export function getTankParts(scene: GLTF['scene']) {
    const wheelNames = [
        'Roaadwheel_L3', 'Roaadwheel_L4', 'Roaadwheel_L5',
        'Roaadwheel_R3', 'Roaadwheel_R4', 'Roaadwheel_R5',
    ];

    const wheels = wheelNames
        .map(name => scene.getObjectByName(name))
        .filter((obj): obj is Object3D => !!obj);

    return {
        hull: scene.getObjectByName('Hull') as Group,
        turret: scene.getObjectByName('Turret') as Group,
        cannon: scene.getObjectByName('Cannon') as Group,
        wheels, // if you have a group for wheels
    };
}
