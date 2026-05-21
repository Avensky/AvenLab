import { useProgress } from "@react-three/drei";
import { useEffect } from "react";
import { useUIStore } from "../store";
import { GameButton } from "../components/GameButton";

export function LoadingScreen() {
  const { progress, active } = useProgress();
  const setScreen = useUIStore((s) => s.setScreen);

  useEffect(() => {
    if (!active && progress >= 100) {
      setScreen("main");
    }
  }, [active, progress, setScreen]);

  return (
    <div className="menu-screen">
      <h1>AvenLab</h1>
      <p>Loading world... {Math.round(progress)}%</p>
      <div className="loading-bar">
        <div style={{ width: `${progress}%` }} />
      </div>

      {progress >= 100 && (
        <GameButton onPress={() => setScreen("main")}>Continue</GameButton>
      )}
    </div>
  );
}