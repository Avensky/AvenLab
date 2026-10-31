/** UI-only surface using the actual game socket. No fake friends/worlds or 3D
 * scene are injected; run the Rust server before using this preview. */
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { SocialPanel } from "../src/game/social/SocialPanel";
import { OnScreenKeyboard } from "../src/components/text/OnScreenKeyboard";
import { Keyboard } from "../src/controls/Keyboard";
import { GameController } from "../src/controls/GameController";
import { useUIStore } from "../src/store/menus/uiStore";
import { useNetworkStore } from "../src/store/session/networkStore";
import { connectRustServer, disconnectRustServer } from "../src/net/rustSocket";
import { useAppTheme } from "../src/theme";
import "../src/index.css";
import "../src/theme/theme.css";
import "../src/components/menus/menus.css";

export function SocialPreview() {
  useAppTheme();
  const screen = useUIStore((state) => state.screen);
  const world = useNetworkStore((state) => state.worldName);
  useEffect(() => {
    useUIStore.getState().setScreen("social");
    connectRustServer();
    return disconnectRustServer;
  }, []);
  return (
    <>
      {screen === "social" ? (
        <SocialPanel />
      ) : (
        <main
          className="menu-surface"
          style={{ padding: 20, color: "var(--app-text)" }}
        >
          <h1>WORLD JOINED: {world}</h1>
          <p>
            This preview stops at the garage handoff. The normal game opens
            vehicle selection here.
          </p>
          <button
            type="button"
            className="menu-control"
            onClick={() => useUIStore.getState().setScreen("social")}
          >
            BACK TO WORLDS
          </button>
        </main>
      )}
      <OnScreenKeyboard />
      <Keyboard />
      <GameController />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<SocialPreview />);
