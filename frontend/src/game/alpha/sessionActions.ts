import { socket } from "../../net/rustSocket";
import { requestSocial } from "../../net/socialClient";
import { useSocialStore } from "../../store/social/socialStore";
import { useAlphaStore, HEROES } from "../../store/alpha/alphaStore";
import { useSelectionStore } from "../../store/selection/selectionStore";
import { useNetworkStore } from "../../store/session/networkStore";
import { useUIStore } from "../../store/menus/uiStore";
import { useGameStore } from "../../store/presentation/gameStore";
import { useRenderSettingsStore } from "../../store/presentation/renderSettingsStore";

export async function joinSelectedMode() {
  const state = useAlphaStore.getState();
  const result = await requestSocial("mode_join", {
    mode: state.mode,
    hero: state.hero,
    map: useSelectionStore.getState().getSelectedMap().id,
  });
  if (result.status === "queued") useUIStore.getState().setScreen("queue");
  return result;
}
let spawning = false;
/** The garage waits for the real spawn acknowledgement before exposing driving.
 * No extra socket, input loop or guessed loading timeout owns gameplay. */
export async function deploySelectedHero() {
  if (spawning) throw Error("Deployment is already in progress.");
  const connection = socket;
  if (!connection || connection.readyState !== WebSocket.OPEN)
    throw Error("Reconnect to the game server first.");
  const selected = useAlphaStore.getState();
  const hero = HEROES.find((h) => h.id === selected.hero)!;
  const active = useSocialStore.getState().view?.alpha?.active;
  if (active && active.hero !== hero.id)
    await requestSocial("hero_select", { hero: hero.id });
  const map =
    useNetworkStore.getState().worldMap ??
    useSelectionStore.getState().getSelectedMap().id;
  spawning = true;
  try {
    await new Promise<void>((resolve, reject) => {
      const clear = () => {
        clearTimeout(timer);
        connection.removeEventListener("message", received);
        connection.removeEventListener("close", closed);
      };
      const closed = () => {
        clear();
        reject(Error("The game connection closed."));
      };
      const received = (event: MessageEvent) => {
        let packet;
        try {
          packet = JSON.parse(event.data);
        } catch {
          return;
        }
        if (
          packet.type === "spawn_error" &&
          (!packet.map || packet.map === map)
        ) {
          clear();
          reject(Error(packet.message ?? "Spawn failed."));
        } else if (
          packet.type === "spawn_ready" &&
          packet.vehicle === hero.vehicle
        ) {
          clear();
          resolve();
        }
      };
      const timer = setTimeout(() => {
        clear();
        reject(Error("The server did not confirm deployment."));
      }, 12000);
      connection.addEventListener("message", received);
      connection.addEventListener("close", closed);
      connection.send(
        JSON.stringify({
          type: "spawn_request",
          map,
          vehicle: hero.vehicle,
          mode: selected.mode,
        }),
      );
    });
    useRenderSettingsStore.getState().startSandbox();
    useGameStore.setState({ camera: "DEFAULT" });
    useUIStore.getState().setScreen("sandbox");
    if (active?.mode === "editor") {
      const { openWorldBuilder } = await import(
        "../../worldBuilder/state/builderActions"
      );
      await openWorldBuilder();
    }
  } finally {
    spawning = false;
  }
}
