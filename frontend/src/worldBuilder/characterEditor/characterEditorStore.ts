import { create } from "zustand";
import { useUIStore, type MenuScreen, type UIOverlay } from "../../store/menus/uiStore";
import { useInputStore } from "../../store/input/inputStore";
import { useBuilderStore } from "../state/builderStore";
import { selectEquippedCharacter, useSocialStore } from "../../store/social/socialStore";
import { characterLook, DEFAULT_CHARACTER, type CharacterChoice } from "../../game/characters/characterCatalog";
import { useFittingTurnStore } from "../../game/characters/fittingControlsStore";
import { useCharacterPreviewStore } from "../../game/characters/characterPreviewStore";

export const CHARACTER_SHOTS = ["Full body", "Selected item", "Face", "Upper body", "Waist", "Feet", "Back", "Left", "Right"] as const;
export type CharacterShot = typeof CHARACTER_SHOTS[number];
type ReturnContext = {
  screen: MenuScreen; overlay: UIOverlay;
  workspace: ReturnType<typeof useBuilderStore.getState>["workspace"];
  presentation: ReturnType<typeof useBuilderStore.getState>["presentation"];
};
export const useCharacterEditorStore = create<{
  choice: CharacterChoice; shot: CharacterShot; revision: number; panelsHidden: boolean; zoomSteps: number;
  viewport: { left: number; top: number; width: number; height: number } | null;
  returnTo: ReturnContext | null;
  preview: (choice: CharacterChoice | null) => void;
  frame: (shot: CharacterShot) => void;
}>(set => ({
  choice: DEFAULT_CHARACTER, shot: "Full body", revision: 0, panelsHidden: false, zoomSteps: 0, viewport: null, returnTo: null,
  preview: choice => { if (choice) set({ choice }); },
  frame: shot => set(s => ({ shot, revision: s.revision + 1 })),
}));

/** Temporarily borrows the builder canvas without loading or changing its world draft. */
export function openCharacterEditor() {
  const ui = useUIStore.getState(), builder = useBuilderStore.getState();
  if (builder.workspace === "character" && (ui.screen === "world_builder" || ui.overlay === "world_builder")) return;
  const saved = selectEquippedCharacter(useSocialStore.getState());
  useInputStore.getState().releaseControls();
  useFittingTurnStore.setState({ characterYaw: 0, dragging: false });
  useCharacterEditorStore.setState({
    choice: characterLook(saved) ? saved! : DEFAULT_CHARACTER, shot: "Full body", panelsHidden: false, viewport: null,
    returnTo: { screen: ui.screen, overlay: ui.overlay, workspace: builder.workspace === "character" ? "layout" : builder.workspace, presentation: builder.presentation },
  });
  useCharacterPreviewStore.setState({ camera: "Full body", zoom: 1, emote: null, insideCar: false,
    cockpitVehicle: null, cockpitAvailable: false, leanAvailable: false, playbackPaused: true, automaticEmotes: false });
  useBuilderStore.setState({ workspace: "character", presentation: "workspace" });
  if (ui.screen === "sandbox") ui.setOverlay("world_builder");
  else ui.setScreen("world_builder");
}

/** Call only after CharacterPage has acknowledged its queued appearance save. */
export function leaveCharacterEditor() {
  const back = useCharacterEditorStore.getState().returnTo;
  useInputStore.getState().releaseControls();
  useFittingTurnStore.setState({ characterYaw: 0, dragging: false });
  useCharacterPreviewStore.setState({ playbackPaused: false, automaticEmotes: true, emote: null });
  useBuilderStore.setState({ workspace: back?.workspace ?? "layout", presentation: back?.presentation ?? "workspace" });
  useCharacterEditorStore.setState({ returnTo: null });
  if (back) useUIStore.setState({ screen: back.screen, overlay: back.overlay });
}
