import { useEffect } from "react";
import { Keyboard } from "./controls/Keyboard";
import { GameController } from "./controls/GameController";
import { connectRustServer } from "./net/rustSocket";
import { startInputSender, stopInputSender } from "./net/inputSender";
import "./App.css";
import { GameUI } from "./game/GameUI";

export default function App() {
  // The HTML logo is visible before JavaScript loads. Clear it after React
  // commits the UI; video, WebGL and server readiness must not hold it open.
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      document.getElementById("startup-screen")?.remove(),
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  // Connect to Rust server on mount
  useEffect(() => {
    connectRustServer();
  }, []);

  // Start input sender loop on mount, stop on unmount
  useEffect(() => {
    startInputSender(60);
    return () => {
      stopInputSender();
    };
  }, []);

  return (
    <div className="canvas-container">
      <GameUI />
      <Keyboard />
      <GameController />
    </div>
  );
}
