import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useGLTF } from "@react-three/drei";
useGLTF.preload("/models/city.glb");

// import ReactDOM from "react-dom/client";
// ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
