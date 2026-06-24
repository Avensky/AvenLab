import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useGLTF } from "@react-three/drei";

useGLTF.preload('/models/vehicles/ae86.glb');
useGLTF.preload('/models/vehicles/tank2.glb');
useGLTF.preload('/models/vehicles/camaro.glb');
useGLTF.preload('/models/vehicles/gt86.glb');
useGLTF.preload('/models/vehicles/brz.glb');
useGLTF.preload("/models/models/blocks/block_01.glb");
// useGLTF.preload('/models/city_rtx.glb');
// useGLTF.preload('/models/city_time_square.glb');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
