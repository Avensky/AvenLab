import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { GarageDriver } from "../characters/GarageDriver";
import type { VictoryPlayback } from "../characters/GarageEmotePlayer";
import { VILLAGER_ID, characterLook, type CharacterChoice } from "../characters/characterCatalog";
import { villagerModelUrl } from "../characters/villagerModel";

export default function VictoryPreview({ choice }: { choice: CharacterChoice }) {
  const reducedMotion = usePreferencesStore(state => state.reducedMotion);
  const [take, setTake] = useState(0);
  const [playing, setPlaying] = useState(true);
  const victory = useMemo<VictoryPlayback>(() => ({ id: "011", onFinish: () => setPlaying(false) }), []);

  const look = characterLook(choice);
  if (choice.id === VILLAGER_ID && (!look || !villagerModelUrl(look))) {
    return <p role="status">Install the Village Woman GLB to preview this celebration.</p>;
  }

  return <section className="result-victory-preview" aria-label="Victory celebration preview">
    <div className="result-victory-stage">
      <Canvas dpr={[.75, 1.25]} frameloop={playing && !reducedMotion ? "always" : "demand"}
        camera={{ position: [.26, 1.23, 3.55], fov: 36 }}
        onCreated={({ camera }) => { camera.lookAt(0, .97, 0); }}>
        <color attach="background" args={["#131b2a"]} />
        <hemisphereLight args={["#dfe8ff", "#394660", 2.2]} />
        <directionalLight position={[2, 4, 3]} intensity={2.4} />
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[12, 12]} />
          <meshStandardMaterial color="#252e40" roughness={.9} />
        </mesh>
        <GarageDriver key={take} choice={choice} victory={victory} />
      </Canvas>
    </div>
    <div className="result-victory-caption">
      <span>{reducedMotion ? "Animation paused by Reduced Motion." : "Small fist pump"}</span>
      <button className="menu-control" type="button" disabled={reducedMotion} onClick={() => {
        setTake(value => value + 1);
        setPlaying(true);
      }}>Replay celebration</button>
    </div>
  </section>;
}
