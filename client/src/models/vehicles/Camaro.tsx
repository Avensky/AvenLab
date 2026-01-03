// Camaro.tsx

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { PropsWithChildren } from 'react';
import { useGLTF } from '@react-three/drei';
import { Group, MathUtils, Color, SpotLight, Vector3, Object3D } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
// import { GroupProps, useFrame, useThree } from '@react-three/fiber';
import { useStore } from '../../store';
// import { Camera, Controls, getState, PhysicsData, useStore } from '../../store';
import { setupVehicleParts } from '../../utils/setupVehicleParts';
import { sharedGlassMaterial } from '../../utils/createGlassMaterialFactory';
import { usePhysicsInterpolator } from '../../hooks/usePhysicsInterpolator'


interface WheelInfo {
    position: { x: number; y: number; z: number }
    quaternion: { x: number; y: number; z: number; w: number }
}

export default forwardRef(function Camaro({ children }: PropsWithChildren, ref: React.Ref<Group>) {
    const tintFirstPerson = new Color(0xffffff);  // Clear
    const tintExterior = new Color(0x556677);     // Blue-gray tint (customize as needed)
    const { scene } = useGLTF('/models/cars/camaro2017.glb');
    const v = new Vector3()
    const camera = useThree((state) => state.camera)
    const vehicleGroupRef = useRef<Group>(null!)

    // Simulate hazard lights
    const blinkTimer = useRef(0)
    const blinkState = useRef(false)

    // Ref's are used for movements    
    const leftLightRef = useRef<SpotLight>(null!)
    const rightLightRef = useRef<SpotLight>(null!)
    const leftTailRef = useRef<SpotLight>(null!)
    const rightTailRef = useRef<SpotLight>(null!)
    const flBlinkerRef = useRef<SpotLight>(null!)
    const frBlinkerRef = useRef<SpotLight>(null!)
    const rlBlinkerRef = useRef<SpotLight>(null!)
    const rrBlinkerRef = useRef<SpotLight>(null!)

    useImperativeHandle(ref, () => vehicleGroupRef.current, [])

    const headlightsOn = useStore().controls.headlights
    const leftBlinker = useStore().controls.blinkerLeft
    const rightBlinker = useStore().controls.blinkerRight
    const hazards = useStore().controls.hazards

    const { setSnapshot, getInterpolated } = usePhysicsInterpolator(100)

    const { clonesByGroup, renderedGroups } = useMemo(() => {

        return setupVehicleParts({
            scene,
            groups: [
                {
                    name: 'BODY',
                    parts: [
                        'SUNROOF', 'SUNROOF_window', 'FRONT_windows',
                        'WINDSHIELD', 'REAR_WINDOW',
                        'RIGHT_QUARTER_WINDOW', 'LEFT_QUARTER_WINDOW',
                        'HEADLIGHT_LENS_LEFT', 'HEADLIGHT_LENS_RIGHT',
                        'TAILLIGHT_LENS_LEFT', 'TAILLIGHT_LENS_RIGHT',
                        'BODY', 'REARVIEW_MIRROR', 'GRILL', 'GRILL_2',
                        'CHASSIS', 'FRONT_BUMPER', 'FRONT_BUMPER_2',
                        'HEADLIGHTS', 'HEADLIGHTS_OFFSET', 'BODY_badges',
                        'BODY_DOOR_FRAMES', 'REAR_BRAKES_LEFT', 'REAR_BRAKES_RIGHT',
                        'REAR_CAB', 'REARBUMPER_badges', 'REARBUMPER',
                        'REARBUMPER_2', 'REARBUMPER_lights', 'REARBUMPER_LIP',
                        'FL_BRAKE_CALIPER', 'FR_BRAKE_CALIPER', 'RL_BRAKE_CALIPER',
                        'RR_BRAKE_CALIPER', 'INTERIOR', 'INTERIOR_2',
                        'SEATS', 'SEATS_2', 'SEATS_3', 'FRONT_CADDY',
                        'DASHBOARD', 'DASHBOARD_2', 'NEEDLE_RPM', 'NEEDLE_SPEED',
                        'MUFFLERS', 'EMPTY'
                    ],
                    transparent: [
                        'SUNROOF', 'SUNROOF_window', 'FRONT_windows', 'WINDSHIELD',
                        'RIGHT_QUARTER_WINDOW', 'LEFT_QUARTER_WINDOW',
                        // 'HEADLIGHT_LENS_LEFT', 'HEADLIGHT_LENS_RIGHT',
                        // 'TAILLIGHT_LENS_LEFT', 'TAILLIGHT_LENS_RIGHT',
                        'REAR_WINDOW',
                    ],
                    opacity: 0.4,
                },
                {
                    name: 'HOOD',
                    parts: [
                        'HOOD_VENT', 'HOOD', 'HOOD_2', 'HOOD_3'
                    ],
                },
                {
                    name: 'TRUNK',
                    parts: [
                        'TRUNK', 'TRUNK_WING', 'CENTER_BREAK_LIGHT',
                        'CHEVY_EMBLEM', 'REAR_BRAKES_BOOT'
                    ],

                },
                {
                    name: 'DOOR_LEFT',
                    parts: [
                        'DOOR_LEFT_LED', 'DOOR_LEFT', 'DOOR_LEFT_2',
                        'DOOR_LEFT_3', 'DOOR_LEFT_4', 'DOOR_LEFT_5',
                        'DOOR_LEFT_6', 'DOOR_LEFT_7', 'MIRROR_LEFT_GLASS',
                        'MIRROR_LEFT', 'MIRROR_LEFT_2', 'MIRROR_LEFT_3',
                        'LEFT_WINDOW',
                    ],
                    transparent: ['LEFT_WINDOW', 'MIRROR_LEFT_GLASS'],
                    opacity: 0.1,
                },
                {
                    name: 'DOOR_RIGHT',
                    parts: [
                        'DOOR_RIGHT_LED', 'DOOR_RIGHT', 'DOOR_RIGHT_2',
                        'DOOR_RIGHT_3', 'DOOR_RIGHT_4', 'DOOR_RIGHT_5',
                        'DOOR_RIGHT_6', 'DOOR_RIGHT_7', 'MIRROR_RIGHT',
                        'MIRROR_RIGHT_2', 'MIRROR_RIGHT_3', 'MIRROR_RIGHT_GLASS',
                        'RIGHT_WINDOWS',
                    ],
                    transparent: ['MIRROR_RIGHT_GLASS', 'RIGHT_WINDOWS'],
                    opacity: 0.1,
                },
                {
                    name: 'FL_WHEEL',
                    parts: ['FL_TIRE', 'FL_RIM', 'FL_ROTOR'],
                },
                {
                    name: 'FR_WHEEL',
                    parts: ['FR_TIRE', 'FR_RIM', 'FR_ROTOR'],
                },
                {
                    name: 'RL_WHEEL',
                    parts: ['RL_TIRE', 'RL_RIM', 'RL_ROTOR'],
                },
                {
                    name: 'RR_WHEEL',
                    parts: ['RR_TIRE', 'RR_RIM', 'RR_ROTOR'],
                },
                {
                    name: 'STEERING_WHEEL',
                    parts: [
                        'STEERING_WHEEL_CENTER', 'STEERING_WHEEL_SIDES',
                        'STEERING_WHEEL_INSIDE', 'STEERING_WHEEL_BOTTOM',],
                },
            ],
            // camMode,
        })

    }, [scene])

    useEffect(() => {
        // Create left headlight
        leftLightRef.current = new SpotLight(0xffffff, 5, 40, Math.PI / 6, 0.2)
        const leftLight = leftLightRef.current
        leftLight.position.set(-.5, 0.7, -1.8) // relative to headlight mesh center
        leftLight.target.position.set(-0.4, -0.6, -5)
        leftLight.target.updateMatrixWorld()
        leftLight.visible = headlightsOn
        vehicleGroupRef.current.add(leftLight)
        vehicleGroupRef.current.add(leftLight.target)

        // Create right headlight
        rightLightRef.current = new SpotLight(0xffffff, 5, 40, Math.PI / 6, 0.2)
        const rightLight = rightLightRef.current
        rightLight.position.set(.55, 0.7, -1.8)
        rightLight.target.position.set(0.4, -0.6, -5)
        rightLight.target.updateMatrixWorld()
        rightLight.visible = headlightsOn
        vehicleGroupRef.current.add(rightLight)
        vehicleGroupRef.current.add(rightLight.target)

        // Left tail light
        leftTailRef.current = new SpotLight(0xff0000, 3, 8, Math.PI / 4, 0.2)
        const leftTail = leftTailRef.current
        leftTail.position.set(-0.5, 0.6, 1.9) // Rear of the car (x,y,z)
        leftTail.target.position.set(-0.5, 0.5, 3)
        leftTail.target.updateMatrixWorld()
        leftTail.visible = false
        vehicleGroupRef.current.add(leftTail)
        vehicleGroupRef.current.add(leftTail.target)

        // Front Right tail light
        rightTailRef.current = new SpotLight(0xff0000, 3, 8, Math.PI / 4, 0.2)
        const rightTail = rightTailRef.current
        rightTail.position.set(0.57, 0.6, 1.8)
        rightTail.target.position.set(0.57, 0.5, 3)
        rightTail.target.updateMatrixWorld()
        rightTail.visible = false
        vehicleGroupRef.current.add(rightTail)
        vehicleGroupRef.current.add(rightTail.target)

        // front Left blinker (orange)
        flBlinkerRef.current = new SpotLight(0xffa500, 12, 16, Math.PI / 8, 0.2)
        const frontLeftBlinker = flBlinkerRef.current
        frontLeftBlinker.position.set(-0.7, 0.6, -1.9)
        frontLeftBlinker.target.position.set(-0.85, 0.6, -3)
        frontLeftBlinker.visible = leftBlinker || hazards
        frontLeftBlinker.target.updateMatrixWorld()
        vehicleGroupRef.current.add(frontLeftBlinker)
        vehicleGroupRef.current.add(frontLeftBlinker.target)

        // front Right blinker (orange)
        frBlinkerRef.current = new SpotLight(0xffa500, 12, 16, Math.PI / 8, 0.2)
        const frontRightBlinker = frBlinkerRef.current
        frontRightBlinker.position.set(0.7, 0.6, -1.9)
        frontRightBlinker.target.position.set(0.9, 0.6, -3)
        frontRightBlinker.visible = rightBlinker || hazards
        frontRightBlinker.target.updateMatrixWorld()
        vehicleGroupRef.current.add(frontRightBlinker)
        vehicleGroupRef.current.add(frontRightBlinker.target)

        // rear Left blinker (orange)
        rlBlinkerRef.current = new SpotLight(0xffa500, 12, 16, Math.PI / 8, 0.2)
        const rearLeftBlinker = rlBlinkerRef.current
        rearLeftBlinker.position.set(-0.5, 0.6, 1.9)
        rearLeftBlinker.target.position.set(-0.9, 0.6, 3)
        rearLeftBlinker.visible = leftBlinker || hazards
        rearLeftBlinker.target.updateMatrixWorld()
        vehicleGroupRef.current.add(rearLeftBlinker)
        vehicleGroupRef.current.add(rearLeftBlinker.target)

        // rear Right blinker (orange)
        rrBlinkerRef.current = new SpotLight(0xffa500, 12, 18, Math.PI / 8, 0.2)
        const rearRightBlinker = rrBlinkerRef.current
        rearRightBlinker.position.set(0.5, 0.6, 1.9)
        rearRightBlinker.target.position.set(0.9, 0.6, 3)
        rearRightBlinker.visible = rightBlinker || hazards
        rearRightBlinker.target.updateMatrixWorld()
        vehicleGroupRef.current.add(rearRightBlinker)
        vehicleGroupRef.current.add(rearRightBlinker.target)
    }, [scene, leftBlinker, rightBlinker, hazards, headlightsOn])


    const wheels = useMemo(() => {
        return [
            clonesByGroup['FL_WHEEL'],
            clonesByGroup['FR_WHEEL'],
            clonesByGroup['RL_WHEEL'],
            clonesByGroup['RR_WHEEL'],
        ].map((group) => {
            // Each group might contain multiple meshes, but we'll treat the group itself as a container
            const groupObj = new Group();
            Object.values(group).forEach((obj: Object3D) => {
                groupObj.add(obj);
            });
            return groupObj;
        });
    }, [clonesByGroup]);

    // Update transformations every frame ie. chassis
    useEffect(() => {
        const id = useStore.getState().player?.id
        const snapshot = useStore.getState()?.physicsData
        if (id && snapshot) {
            // console.log('[Prime] Initial snapshot', snapshot)
            setSnapshot(id, snapshot)
        }
    }, [useStore(s => s.physicsData)])

    useFrame((_, delta) => {
        // get state on frame
        const id = useStore.getState().player?.id
        if (!id) return
        const interp = getInterpolated(id)
        if (!interp) return

        const controls = useStore.getState().controls
        const camMode = useStore.getState().camera
        const isEditor = useStore.getState().booleans.editor

        // Update blink state every 0.5s
        blinkTimer.current += delta
        if (blinkTimer.current >= 0.5) {
            blinkTimer.current = 0
            blinkState.current = !blinkState.current
        }

        // Lights visibility
        if (leftLightRef.current) leftLightRef.current.visible = controls.headlights
        if (rightLightRef.current) rightLightRef.current.visible = controls.headlights

        if (leftTailRef.current) leftTailRef.current.visible = controls.brake
        if (rightTailRef.current) rightTailRef.current.visible = controls.brake

        const hazards = controls.hazards
        const blinkerLeft = controls.blinkerLeft
        const blinkerRight = controls.blinkerRight && !hazards
        const blinkOn = blinkState.current

        //headlights
        leftLightRef.current.visible = controls.headlights
        rightLightRef.current.visible = controls.headlights

        //taillights
        leftTailRef.current.visible = controls.brake
        rightTailRef.current.visible = controls.brake

        if (flBlinkerRef.current) flBlinkerRef.current.visible = (hazards || blinkerLeft) && blinkOn
        if (frBlinkerRef.current) frBlinkerRef.current.visible = (hazards || blinkerRight) && blinkOn
        if (rlBlinkerRef.current) rlBlinkerRef.current.visible = (hazards || blinkerLeft) && blinkOn
        if (rrBlinkerRef.current) rrBlinkerRef.current.visible = (hazards || blinkerRight) && blinkOn

        const group = vehicleGroupRef.current

        // Update vehicle body
        group.position.set(interp.chassisBody.position.x, interp.chassisBody.position.y, interp.chassisBody.position.z)
        group.quaternion.set(interp.chassisBody.quaternion.x, interp.chassisBody.quaternion.y, interp.chassisBody.quaternion.z, interp.chassisBody.quaternion.w)

        // ✅ Direct apply instead of lerp
        interp.wheelInfos.forEach((wheel: WheelInfo, i: number) => {
            if (!wheels[i]) return
            wheels[i].position.set(wheel.position.x, wheel.position.y, wheel.position.z)
            wheels[i].quaternion.set(wheel.quaternion.x, wheel.quaternion.y, wheel.quaternion.z, wheel.quaternion.w)
        })

        if (!isEditor && (camMode === 'FIRST_PERSON' || camMode === 'DEFAULT' || camMode === 'BIRDS_EYE')) {
            if (camMode === 'FIRST_PERSON') { v.set(-0.25, .98, -.1); }
            else if (camMode === 'DEFAULT') { v.set(0, 2, 4); }
            else if (camMode === 'BIRDS_EYE') { v.set(0, 7, 12); }
            camera.position.lerp(v, delta);

            // NEW: Smooth camera lookAt
            const target2 = new Vector3();
            vehicleGroupRef.current.getWorldPosition(target2);
            if (camMode === 'DEFAULT') {
                target2.y += 1.5; // Slight elevation for third-person
                camera.lookAt(target2)
            }
        }

        const isFirstPerson = camMode === 'FIRST_PERSON';
        const targetOpacity = isFirstPerson ? 0.1 : 0.4;
        const targetIOR = isFirstPerson ? 1.0 : 6.5;
        const targetColor = isFirstPerson ? tintFirstPerson : tintExterior;
        const transitionSpeed = 3.0; // seconds it takes to reach 90% of the transition
        const t = delta / transitionSpeed;

        sharedGlassMaterial.opacity = MathUtils.lerp(
            sharedGlassMaterial.opacity,
            targetOpacity,
            t
        );

        sharedGlassMaterial.ior = MathUtils.lerp(
            sharedGlassMaterial.ior,
            targetIOR,
            t
        );

        sharedGlassMaterial.color.lerp(targetColor, t); // 👈 tint fade

        sharedGlassMaterial.needsUpdate = true;


    })

    {/* <Dust /> */ }
    {/* <Skid /> */ }
    return (
        <>
            <group ref={vehicleGroupRef}>
                {Object.values(renderedGroups)}
                {children}
            </group>
            {wheels.map((wheel, i) => (
                <primitive key={`wheel-${i}`} object={wheel} />
            ))}
        </>
    );
})
