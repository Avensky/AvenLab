import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { WorldRenderer } from "./components/WorldRenderer";
import { ModeSwitcher } from "./components/ModeSwitcher";
import { useSnapshot } from "./hooks/useSnapshot";
import { socket } from "./net/socket";
import { useEffect } from "react";

export default function App() {
  // connect socket
  useEffect(() => {
    socket.on("connect", () => {
      console.log("Connected to server:", socket.id);
    });

    socket.on("hello", (data) => {
      console.log("Server says:", data);
    });

    return () => {
      socket.off("connect");
      socket.off("hello");
    };
  }, []);

  useSnapshot();

  return (
    <>
      <ModeSwitcher />

      <Canvas camera={{ position: [6, 6, 6], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[4, 6, 3]} intensity={1} />

        <Grid infiniteGrid args={[10, 10]} />

        <WorldRenderer />
        <OrbitControls />
      </Canvas>
    </>
  );
}
