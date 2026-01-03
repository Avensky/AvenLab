// Ae86
import React, { forwardRef, useImperativeHandle, useEffect, useMemo, useRef } from 'react'
import type { PropsWithChildren } from 'react';
import { Vector3, Group, MathUtils } from 'three'
// import { Vector3, Group, SpotLightHelper, Color, DirectionalLight } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { clone } from 'lodash-es'
import { SpotLight } from 'three'
// import { useHelper } from '@react-three/drei'
// import { AccelerateAudio, BoostAudio, Boost, BrakeAudio, Dust, EngineAudio, HonkAudio, Skid, Cameras } from '../../effects'
// import { useToggle } from '../../useToggle'
import { useStore } from '../../store'
import { usePhysicsInterpolator } from '../../hooks/usePhysicsInterpolator'

interface WheelInfo {
    position: { x: number; y: number; z: number }
    quaternion: { x: number; y: number; z: number; w: number }
}
export default forwardRef(function Ae86({ children }: PropsWithChildren, ref: React.Ref<Group>) {

    const { scene } = useGLTF('/models/cars/ae86v2.glb')
    const vector = new Vector3()
    const camera = useThree((s) => s.camera)
    const carGroupRef = useRef<Group>(null!)

    // Pop up headlights ref
    const headlightRef = useRef<Group>(null!)
    const headlightRotation = useRef(0)

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

    useImperativeHandle(ref, () => carGroupRef.current, [])
    const headlightsOn = useStore().controls.headlights
    const leftBlinker = useStore().controls.blinkerRight
    const rightBlinker = useStore().controls.blinkerRight
    const hazards = useStore().controls.hazards

    const { setSnapshot, getInterpolated } = usePhysicsInterpolator(100)

    useEffect(() => {
        const parts = ['CarBody', 'Interior', 'SteeringWheel', 'Headlights', 'FL_Caliper', 'FR_Caliper', 'RL_Caliper', 'RR_Caliper']

        parts.forEach(name => {
            const original = scene.getObjectByName(name)
            if (original) {
                const cloned = original.clone(true)
                if (name === 'Headlights' && cloned instanceof Group)
                    headlightRef.current = cloned
                carGroupRef.current.add(cloned)
            }
        })

        // Create left headlight
        leftLightRef.current = new SpotLight(0xffffff, 5, 40, Math.PI / 6, 0.2)
        const leftLight = leftLightRef.current
        leftLight.position.set(-.5, 0.7, -1.8) // relative to headlight mesh center
        leftLight.target.position.set(-0.4, -0.6, -5)
        leftLight.target.updateMatrixWorld()
        leftLight.visible = headlightsOn
        carGroupRef.current.add(leftLight)
        carGroupRef.current.add(leftLight.target)

        // Create right headlight
        rightLightRef.current = new SpotLight(0xffffff, 5, 40, Math.PI / 6, 0.2)
        const rightLight = rightLightRef.current
        rightLight.position.set(.55, 0.7, -1.8)
        rightLight.target.position.set(0.4, -0.6, -5)
        rightLight.target.updateMatrixWorld()
        rightLight.visible = headlightsOn
        carGroupRef.current.add(rightLight)
        carGroupRef.current.add(rightLight.target)

        // Left tail light
        leftTailRef.current = new SpotLight(0xff0000, 3, 8, Math.PI / 4, 0.2)
        const leftTail = leftTailRef.current
        leftTail.position.set(-0.5, 0.6, 1.9) // Rear of the car (x,y,z)
        leftTail.target.position.set(-0.5, 0.5, 3)
        leftTail.target.updateMatrixWorld()
        leftTail.visible = false
        carGroupRef.current.add(leftTail)
        carGroupRef.current.add(leftTail.target)

        // Front Right tail light
        rightTailRef.current = new SpotLight(0xff0000, 3, 8, Math.PI / 4, 0.2)
        const rightTail = rightTailRef.current
        rightTail.position.set(0.57, 0.6, 1.8)
        rightTail.target.position.set(0.57, 0.5, 3)
        rightTail.target.updateMatrixWorld()
        rightTail.visible = false
        carGroupRef.current.add(rightTail)
        carGroupRef.current.add(rightTail.target)

        // front Left blinker (orange)
        flBlinkerRef.current = new SpotLight(0xffa500, 12, 16, Math.PI / 8, 0.2)
        const frontLeftBlinker = flBlinkerRef.current
        frontLeftBlinker.position.set(-0.7, 0.6, -1.9)
        frontLeftBlinker.target.position.set(-0.85, 0.6, -3)
        frontLeftBlinker.visible = leftBlinker || hazards
        frontLeftBlinker.target.updateMatrixWorld()
        carGroupRef.current.add(frontLeftBlinker)
        carGroupRef.current.add(frontLeftBlinker.target)

        // front Right blinker (orange)
        frBlinkerRef.current = new SpotLight(0xffa500, 12, 16, Math.PI / 8, 0.2)
        const frontRightBlinker = frBlinkerRef.current
        frontRightBlinker.position.set(0.7, 0.6, -1.9)
        frontRightBlinker.target.position.set(0.9, 0.6, -3)
        frontRightBlinker.visible = rightBlinker || hazards
        frontRightBlinker.target.updateMatrixWorld()
        carGroupRef.current.add(frontRightBlinker)
        carGroupRef.current.add(frontRightBlinker.target)

        // rear Left blinker (orange)
        rlBlinkerRef.current = new SpotLight(0xffa500, 12, 16, Math.PI / 8, 0.2)
        const rearLeftBlinker = rlBlinkerRef.current
        rearLeftBlinker.position.set(-0.5, 0.6, 1.9)
        rearLeftBlinker.target.position.set(-0.9, 0.6, 3)
        rearLeftBlinker.visible = leftBlinker || hazards
        rearLeftBlinker.target.updateMatrixWorld()
        carGroupRef.current.add(rearLeftBlinker)
        carGroupRef.current.add(rearLeftBlinker.target)

        // rear Right blinker (orange)
        rrBlinkerRef.current = new SpotLight(0xffa500, 12, 18, Math.PI / 8, 0.2)
        const rearRightBlinker = rrBlinkerRef.current
        rearRightBlinker.position.set(0.5, 0.6, 1.9)
        rearRightBlinker.target.position.set(0.9, 0.6, 3)
        rearRightBlinker.visible = rightBlinker || hazards
        rearRightBlinker.target.updateMatrixWorld()
        carGroupRef.current.add(rearRightBlinker)
        carGroupRef.current.add(rearRightBlinker.target)

    }, [scene])

    const wheels = useMemo(() => {
        const names = ['FL_Wheel', 'FR_Wheel', 'RL_Wheel', 'RR_Wheel'] // <- update if needed
        return names.map(name => {
            const original = scene.getObjectByName(name)
            return original ? clone(original) : null
        })
    }, [scene, leftBlinker, rightBlinker, hazards, headlightsOn])

    // Update transformations every frame ie. chassis
    useEffect(() => {
        const id = useStore.getState().player?.id
        const snapshot = useStore.getState()?.physicsData
        if (id && snapshot) setSnapshot(id, snapshot)

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

        //POP UP HEADLIGHTS
        const openRotation = 0// headlights up
        const closedRotation = -Math.PI / 3 // headlights down
        const target = controls.headlights ? openRotation : closedRotation
        headlightRotation.current = MathUtils.lerp(headlightRotation.current, target, 5 * delta)

        if (headlightRef.current) {
            headlightRef.current.rotation.x = headlightRotation.current
        }

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

        // if (!physicsData) return
        // const { chassisBody, wheelInfos } = physicsData
        const group = carGroupRef.current

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
            if (camMode === 'FIRST_PERSON') { vector.set(0.29, 0.97, -0.01); }
            else if (camMode === 'DEFAULT') { vector.set(0, 1.75, 3.85); }
            else if (camMode === 'BIRDS_EYE') { vector.set(0, 7, 12); }
            camera.position.lerp(vector, delta);

            // NEW: Smooth camera lookAt
            const target2 = new Vector3();
            carGroupRef.current.getWorldPosition(target2);
            if (camMode === 'DEFAULT') {
                target2.y += 1.5; // Slight elevation for third-person
                camera.lookAt(target2)
            }
        }



    })

    // Headlights
    // useHelper(leftLightRef, SpotLightHelper, 'white')
    // useHelper(rightLightRef, SpotLightHelper, 'white')
    // Tail lights
    // useHelper(leftTailRef, SpotLightHelper, 'red')
    // useHelper(rightTailRef, SpotLightHelper, 'red')
    //Left Blinkers
    // useHelper(flBlinkerRef, SpotLightHelper, 'orange')
    // useHelper(rlBlinkerRef, SpotLightHelper, 'orange')
    // Right Blinkers
    // useHelper(frBlinkerRef, SpotLightHelper, 'orange')
    // useHelper(rrBlinkerRef, SpotLightHelper, 'orange')

    // console.log(scene)
    // const ToggledAccelerateAudio = useToggle(AccelerateAudio, ['ready', 'sound'])
    // const ToggledEngineAudio = useToggle(EngineAudio, ['ready', 'sound'])

    // useLayoutEffect(() => api.sliding.subscribe((sliding) => (mutation.sliding = sliding)), [api])
    return (
        <>
            {/* Vehicle */}
            <group ref={carGroupRef} >
                {/* <ToggledAccelerateAudio /> */}
                {/* <BoostAudio /> */}
                {/* <BrakeAudio /> */}
                {/* <ToggledEngineAudio /> */}
                {/* <HonkAudio /> */}
                {/* <Boost /> */}
                {children}
            </group>
            {/* <axesHelper args={[0.5]} /> */}
            {/* Wheels */}
            {wheels.map((wheel, i) =>
                wheel ? <primitive key={i} object={wheel} /> : null
            )}
            {/* <Dust /> */}
            {/* <Skid /> */}
        </>
    )
})