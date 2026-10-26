import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useGLTF } from '@react-three/drei'
// Serve mesh decoding with the app, including when a CDN is unreachable.
useGLTF.setDecoderPath('/draco/')
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
