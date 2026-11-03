import { useProgress } from "@react-three/drei";
import { useEffect } from "react";
import { useUIStore } from "../store";
import { ControllerAction } from "../components/controller";

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
        <ControllerAction button="A" onClick={() => setScreen("main")}>CONTINUE</ControllerAction>
      )}
    </div>
  );
}
