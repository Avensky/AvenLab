import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useGLTF } from "@react-three/drei";

// import ReactDOM from "react-dom/client";
// ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
useGLTF.preload('/models/cars/ae86v2.glb');
useGLTF.preload('/models/cars/tank2.glb');
useGLTF.preload('/models/camaro.glb');
useGLTF.preload("/models/city.glb");
// useGLTF.preload('/models/city_rtx.glb');
// useGLTF.preload('/models/city_time_square.glb');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
