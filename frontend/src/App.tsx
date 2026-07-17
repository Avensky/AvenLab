import { useEffect } from 'react';
import { Keyboard } from "./controls/Keyboard";
import { GameController } from "./controls/GameController";
import { connectRustServer } from "./net/rustSocket";
import { startInputSender, stopInputSender } from "./store/tools/InputSender";
import './App.css';
import { GameUI } from './game/GameUI';

export default function App() {
  
  // Connect to Rust server on mount
  useEffect(() => { connectRustServer(); }, []);
  
  // Start input sender loop on mount, stop on unmount
  useEffect(() => {
    startInputSender(60);
    return () => { stopInputSender(); };
  }, []);

  return (
    <div className="canvas-container">
      <GameUI />
      
      <Keyboard />
      <GameController />
    </div>
  );
}
