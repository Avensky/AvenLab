// DebugChassis.tsx
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Body } from 'cannon-es';
import * as THREE from 'three';

interface DebugChassisProps {
    chassisBody: Body;
    width: number;
    height: number;
    length: number;
}

export function DebugChassis({ chassisBody, width, height, length }: DebugChassisProps) {
    const ref = useRef<THREE.Mesh>(null);

    useFrame(() => {
        if (ref.current) {
            ref.current.position.copy(chassisBody.position as unknown as THREE.Vector3);
            ref.current.quaternion.copy(chassisBody.quaternion as unknown as THREE.Quaternion);
        }
    });

    return (
        <mesh ref={ref} >
            <boxGeometry args={[width, height, length]} />
            < meshStandardMaterial color="red" wireframe />
        </mesh>
    );
}

interface DebugWheelProps {
    wheelBody: Body;
    radius: number;
    width: number;
}

export function DebugWheel({ wheelBody, radius, width }: DebugWheelProps) {
    const ref = useRef<THREE.Mesh>(null);

    useFrame(() => {
        if (ref.current) {
            ref.current.position.copy(wheelBody.position as unknown as THREE.Vector3);
            ref.current.quaternion.copy(wheelBody.quaternion as unknown as THREE.Quaternion);
        }
    });

    return (
        <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]} >
            <cylinderGeometry args={[radius, radius, width, 16]} />
            < meshStandardMaterial color="blue" wireframe />
        </mesh>
    );
}