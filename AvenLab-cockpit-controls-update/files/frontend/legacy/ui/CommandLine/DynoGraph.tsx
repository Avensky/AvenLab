// // DynoV2.tsx

// import React, { useEffect, useRef } from 'react'
// import { useStore } from '../../store'

// interface DynoGraphProps {
//     paused: boolean;
// }
// export default function DynoGraph({ paused }: DynoGraphProps): React.JSX.Element {
//     const canvasRef = useRef<HTMLCanvasElement>(null)
//     const dataRef = useRef<{ rpm: number, torque: number, power: number }[]>([])

//     const latestRPM = useRef(0)
//     const latestTorque = useRef(0)
//     const frame = useStore(s => s.frames)
//     console.log('frame', frame)
//     if (frame && !paused) {

//         if (frame.canId.trim() === "rpms") latestRPM.current = frame.value
//         if (frame.canId.trim() === "engine-torque") latestTorque.current = frame.value

//         const rpm = latestRPM.current
//         const torque = latestTorque.current
//         const power = (torque * rpm) / 5252
//         console.log(`RPM: ${rpm} Torque: ${torque} Power: ${power}`)
//         dataRef.current.push({ rpm, torque, power })
//         if (dataRef.current.length > 300) dataRef.current.shift()
//     }

//     useEffect(() => {
//         const canvas = canvasRef.current
//         const ctx = canvas?.getContext('2d')
//         if (!ctx || !canvas) return

//         const draw = () => {
//             ctx.clearRect(0, 0, canvas.width, canvas.height)

//             const maxTorque = Math.max(...dataRef.current.map(pt => pt.torque), 1)
//             const maxPower = Math.max(...dataRef.current.map(pt => pt.power), 1)

//             // Torque curve
//             ctx.beginPath()
//             dataRef.current.forEach((pt, i) => {
//                 const x = (i / dataRef.current.length) * canvas.width
//                 const y = canvas.height - (pt.torque / maxTorque) * canvas.height
//                 if (i === 0) ctx.moveTo(x, y)
//                 else ctx.lineTo(x, y)
//             })
//             ctx.strokeStyle = 'orange'
//             ctx.stroke()

//             // Power curve (✅ FIXED!)
//             ctx.beginPath()
//             dataRef.current.forEach((pt, i) => {
//                 const x = (i / dataRef.current.length) * canvas.width
//                 const y = canvas.height - (pt.power / maxPower) * canvas.height
//                 if (i === 0) ctx.moveTo(x, y)
//                 else ctx.lineTo(x, y)
//             })
//             ctx.strokeStyle = 'blue'
//             ctx.stroke()
//         }

//         let animId = 0
//         const tick = () => {
//             draw()
//             animId = requestAnimationFrame(tick)
//         }
//         tick()

//         return () => cancelAnimationFrame(animId)
//     }, [])

//     return (
//         <div className='Log'>
//             <canvas
//                 ref={canvasRef}
//                 width={400}
//                 height={200}
//                 style={{ width: '100%', height: '100%' }}
//             />
//         </div>
//     )
// }
