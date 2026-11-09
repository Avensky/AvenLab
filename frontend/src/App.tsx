import { useEffect } from "react";
import { Keyboard } from "./controls/Keyboard";
import { GameController } from "./controls/GameController";
import { useMobilePortrait } from "./controls/useMobilePortrait";
import { releaseWeaponSource } from "./combat/turretControls";
import { connectRustServer } from "./net/rustSocket";
import { startInputSender, stopInputSender } from "./net/inputSender";
import { useInputStore } from "./store/input/inputStore";
import "./App.css";
import { GameUI } from "./game/GameUI";
import { OnScreenKeyboard } from "./components/text/OnScreenKeyboard";

export default function App() {
  const mobilePortrait = useMobilePortrait();

  useEffect(() => {
    if (mobilePortrait) {
      useInputStore.getState().releaseControls();
      releaseWeaponSource("pointer");
    }
  }, [mobilePortrait]);

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
      <div className="game-viewport" inert={mobilePortrait}>
        <GameUI />
        {!mobilePortrait && <OnScreenKeyboard />}
      </div>
      {mobilePortrait ? (
        <div className="mobile-rotate-screen" role="status">
          <svg width="64" height="64" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="7" y="19" width="34" height="21" rx="3" />
            <path d="M30 7a15 15 0 0 0-19 6m0-7v7h7m18 14v5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h1>Rotate to play</h1>
          <p>Turn your device sideways for the widescreen view.</p>
        </div>
      ) : <><Keyboard /><GameController /></>}
    </div>
  );
}
