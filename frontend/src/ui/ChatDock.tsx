import { LobbyChat } from "../game/alpha/LobbyChat";

/** Driving reuses the authenticated chat owner instead of a placeholder panel. */
export function ChatDock() {
  return (
    <div className="driving-chat">
      <LobbyChat driving />
    </div>
  );
}
