// utils/physicsInterpolator.ts
import { useRef } from 'react'
import { Vector3, Quaternion } from 'three'

type Vec3 = { x: number; y: number; z: number }
type Quat = { x: number; y: number; z: number; w: number }

export interface VehiclePhysicsSnapshot {
  chassisBody: {
    position: Vec3
    quaternion: Quat
  }
  wheelInfos: Array<{
    position: Vec3
    quaternion: Quat
  }>
}

export function usePhysicsInterpolator(blendTime = 100) {
  const vehiclesRef = useRef<{
    [id: string]: {
      prev: VehiclePhysicsSnapshot | null
      next: VehiclePhysicsSnapshot | null
      lastUpdate: number
    }
  }>({})

  function setSnapshot(id: string, snapshot: VehiclePhysicsSnapshot) {
    // console.log(`[Interpolator] setSnapshot called for ID ${id}`, snapshot)

    if (!vehiclesRef.current[id]) {
      // console.log(`[Interpolator] Initial snapshot for ${id}`)
      vehiclesRef.current[id] = {
        prev: null,
        next: snapshot,
        lastUpdate: Date.now(),
      }
      return
    }

    const v = vehiclesRef.current[id]
    v.prev = v.next
    v.next = snapshot
    v.lastUpdate = Date.now()
    // console.log(`[Interpolator] Updated snapshot for ${id}`, {
    //   prev: v.prev,
    //   next: v.next
    // })
  }

  function getInterpolated(id: string) {
    const v = vehiclesRef.current[id]
    if (!v) {
      // console.log(`[Interpolator] getInterpolated: no entry for ID ${id}`)
      return null
    }

    if (!v.next) {
      // console.log(`[Interpolator] getInterpolated: no NEXT snapshot for ID ${id}`)
      return null
    }

    const now = Date.now()
    const t = Math.min((now - v.lastUpdate) / blendTime, 1)

    if (!v.prev) {
      // console.log(`[Interpolator] getInterpolated: no PREV, returning NEXT for ID ${id}`)
      return v.next
    }

    // Interpolate chassis
    const p1 = new Vector3(v.prev.chassisBody.position.x, v.prev.chassisBody.position.y, v.prev.chassisBody.position.z)
    const p2 = new Vector3(v.next.chassisBody.position.x, v.next.chassisBody.position.y, v.next.chassisBody.position.z)
    const chassisPosition = p1.lerp(p2, t)

    const q1 = new Quaternion(v.prev.chassisBody.quaternion.x, v.prev.chassisBody.quaternion.y, v.prev.chassisBody.quaternion.z, v.prev.chassisBody.quaternion.w)
    const q2 = new Quaternion(v.next.chassisBody.quaternion.x, v.next.chassisBody.quaternion.y, v.next.chassisBody.quaternion.z, v.next.chassisBody.quaternion.w)
    const chassisQuaternion = q1.slerp(q2, t)

    // Interpolate wheels
    const wheelInfos = v.next.wheelInfos.map((nextWheel, i) => {
      const prevWheel = v.prev!.wheelInfos[i]
      const wp1 = new Vector3(prevWheel.position.x, prevWheel.position.y, prevWheel.position.z)
      const wp2 = new Vector3(nextWheel.position.x, nextWheel.position.y, nextWheel.position.z)
      const wheelPos = wp1.lerp(wp2, t)

      const wq1 = new Quaternion(prevWheel.quaternion.x, prevWheel.quaternion.y, prevWheel.quaternion.z, prevWheel.quaternion.w)
      const wq2 = new Quaternion(nextWheel.quaternion.x, nextWheel.quaternion.y, nextWheel.quaternion.z, nextWheel.quaternion.w)
      const wheelQuat = wq1.slerp(wq2, t)

      return {
        position: { x: wheelPos.x, y: wheelPos.y, z: wheelPos.z },
        quaternion: { x: wheelQuat.x, y: wheelQuat.y, z: wheelQuat.z, w: wheelQuat.w },
      }
    })

    // console.log(`[Interpolator] getInterpolated: blended t=${t.toFixed(2)} for ID ${id}`)

    return {
      chassisBody: {
        position: { x: chassisPosition.x, y: chassisPosition.y, z: chassisPosition.z },
        quaternion: { x: chassisQuaternion.x, y: chassisQuaternion.y, z: chassisQuaternion.z, w: chassisQuaternion.w },
      },
      wheelInfos
    }
  }

  return { setSnapshot, getInterpolated }
}
