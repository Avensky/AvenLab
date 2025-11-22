import { OrbitControls, Grid, useGLTF } from "@react-three/drei";
import { WorldRenderer } from "./components/WorldRenderer";
import { ModeSwitcher } from "./components/ModeSwitcher";
import { useSnapshots } from "./hooks/useSnapshots";
import { socket } from "./net/socket";
import { useEffect } from "react";
import { usePlayerInput } from "./hooks/usePlayerInput";
import { FullscreenCanvas } from "./layout/FullscreenCanvas";
import { CityScene } from "./scenes/CityScene";
import { HeightfieldGeneratorPanel } from "./tools/HeightfieldGeneratorPanel";
import { CityHeightfield } from "./scenes/CityHeightfield";
import { CityBuildingColliders } from "./scenes/CityBuildingColliders";
import heightfieldJSON from '../../server/data/city-heightfield.json'
import { useSnapshotStore } from "./store/snapshotStore";
export default function App() {
  useSnapshots();
  usePlayerInput();

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

  // useSnapshot();

  const mode = useSnapshotStore(s => s.mode);
  const { scene } = useGLTF("/models/city.glb");



  return (
    <>
      <ModeSwitcher />
      <HeightfieldGeneratorPanel />

      <FullscreenCanvas>
        <ambientLight intensity={0.5} />
        <directionalLight intensity={1} position={[5, 5, 5]} />
        {/* <Grid infiniteGrid args={[10, 10]} /> */}

        {mode === "glb" && <CityScene />}
        {mode === "geometry" && <CityHeightfield data={heightfieldJSON} />}
        {mode === "collider" && <CityBuildingColliders glb={scene} />}

        <WorldRenderer />
        <OrbitControls />
      </FullscreenCanvas>
    </>
  );
}
