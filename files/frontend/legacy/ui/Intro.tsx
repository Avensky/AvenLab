// import { Suspense, useEffect, useState } from 'react'
// import { useProgress } from '@react-three/drei'

// import type { ReactNode } from 'react'

// import { useStore } from '../store'
// import { Keys } from './Keys'
// // import { Auth } from './Auth'
// import { Html } from "@react-three/drei"

// export function Intro({ children }: { children: ReactNode }): JSX.Element {
//   const [clicked, setClicked] = useState(false)
//   const [loading, setLoading] = useState(false)
//   const { progress } = useProgress()
//   const [session, set] = useStore((state) => [state.session, state.set])

//   useEffect(() => {
//     if (clicked && !loading) set({ ready: true })
//   }, [clicked, loading])

//   useEffect(() => {
//     if (progress === 100) setLoading(false)
//   }, [progress])

//   useEffect(() => {
//     // setupSession(set)
//   }, [])

//   return (
//     <Html>
//       {children}
//       {/* <Suspense fallback={null}>{children}</Suspense> */}
//       <div className={`fullscreen bg ${loading ? 'loading' : 'loaded'} ${clicked && 'clicked'}`}>
//         <div className="stack">
//           <div className="intro-keys">
//             <Keys style={{ paddingBottom: 20 }} />
//           </div>
//           <a className="start-link" href="#" onClick={() => setClicked(true)}>
//             {loading ? `loading ${progress.toFixed()} %` : 'Click to start'}
//           </a>
//           {/* {session?.user?.aud !== 'authenticated' ? (
//             <Auth />
//           ) : (
//             <div>
//               Hello {session.user.user_metadata.full_name}
//               <button className="logout">Logout</button>{' '}
//             </div>
//           )} */}
//         </div>
//       </div>
//     </Html>
//   )
// }
