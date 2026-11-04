import { socket } from "../../net/rustSocket";
import { requestSocial } from "../../net/socialClient";
import { useSocialStore } from "../../store/social/socialStore";
import { useAlphaStore, HEROES, canonicalGameMode, isMatchMode, modeTeamSize } from "../../store/alpha/alphaStore";
import { mapCatalog, useSelectionStore } from "../../store/selection/selectionStore";
import { useNetworkStore } from "../../store/session/networkStore";
import { useUIStore } from "../../store/menus/uiStore";
import { useGameStore } from "../../store/presentation/gameStore";
import { useRenderSettingsStore } from "../../store/presentation/renderSettingsStore";

export async function joinSelectedMode() {
  const state = useAlphaStore.getState();
  if (state.mode === "signal_recon" || state.mode === "swarm")
    throw Error("Select a driving mode before joining the alpha queue.");
  if (!useSocialStore.getState().view?.profile.id)
    throw Error("Restore your player profile or choose New Tab Profile before joining.");
  const previousView=useSocialStore.getState().view;
  const result = await requestSocial("mode_join", {
    mode: canonicalGameMode(state.mode),
    ...(isMatchMode(state.mode)?{team_size:state.mode==='skirmish'?3:state.teamSize}:{}),
    // Reserve capacity first. A role is claimed only by an explicit portrait pick.
    hero: "",
    map: useSelectionStore.getState().getSelectedMap().id,
  });
  if(result.status==='joined'||result.status==='queued'){
    const confirmedMode=typeof result.mode==='string'&&isMatchMode(result.mode)?result.mode:state.mode;
    useAlphaStore.getState().restoreMode(confirmedMode,typeof result.team_size==='number'?result.team_size:state.teamSize);
  }
  if (result.status === "joined") {
    // An admitted seat needs no one-frame trip through the video/queue screen.
    if (typeof result.hero === "string" && result.hero)
      state.chooseHero(result.hero);
    else state.clearHero();
    useUIStore.getState().setScreen("hero_select");
  } else if (result.status === "queued") {
    // A queued ACK confirms mode_join released the old seat/ticket. The socket
    // may deliver this ACK before its coalesced social view; leaving that cached
    // active seat here would make useAlphaFlow reopen the previous Hero screen.
    // Keep a newer compatible promotion if it already arrived from another world.
    const selection=useAlphaStore.getState();
    const matches=(candidate:{mode:string;team_size?:number})=>canonicalGameMode(candidate.mode)===selection.mode&&(!isMatchMode(selection.mode)||modeTeamSize(candidate.mode,candidate.team_size)===selection.teamSize);
    let refreshAmbiguousSeat=false;
    useSocialStore.setState(current=>{
      if(!current.view?.alpha||current.view.profile.id!==previousView?.profile.id)return current;
      const alpha=current.view.alpha;
      const active=alpha.active&&alpha.active.world_id!==previousView?.alpha?.active?.world_id&&matches(alpha.active)?alpha.active:null;
      const queue=alpha.queue&&alpha.queue!==previousView?.alpha?.queue&&matches(alpha.queue)?alpha.queue:null;
      // A recycled world ID cannot distinguish an old seat from a very early
      // promotion. Discard that ambiguity and ask for a new authoritative view.
      refreshAmbiguousSeat=!!alpha.active&&!active&&alpha!==previousView?.alpha&&matches(alpha.active);
      if(active===alpha.active&&queue===alpha.queue)return current;
      return {view:{...current.view,alpha:{...alpha,active,queue}}};
    });
    useUIStore.getState().setScreen("queue");
    if(refreshAmbiguousSeat)void requestSocial('refresh').catch(()=>{/* Queue retry remains available if transport recovery fails. */});
  }
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
  const hero = HEROES.find((h) => h.id === selected.hero);
  if (!hero) throw Error("Choose a hero before deploying.");
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
          mode: active?.mode ?? selected.mode,
        }),
      );
    });
    useRenderSettingsStore.getState().startSandbox();
    useGameStore.setState({ camera: "DEFAULT" });
    if (selected.mode === "editor") {
      const { useBuilderStore } = await import("../../worldBuilder/state/builderStore");
      const selectedMap = mapCatalog.findIndex(item => item.id === map);
      if(selectedMap >= 0) useSelectionStore.setState({mapIndex:selectedMap});
      useBuilderStore.setState({workspace:"layout",presentation:"workspace"});
      // Enter authoring atomically: never expose a driving frame underneath.
      useUIStore.setState({ screen: "sandbox", overlay: "world_builder" });
      const { openWorldBuilder } =
        await import("../../worldBuilder/state/builderActions");
      await openWorldBuilder();
    } else useUIStore.getState().setScreen("sandbox");
  } finally {
    spawning = false;
  }
}
