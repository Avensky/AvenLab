import { MenuIcon } from "../../components/menus/MenuIcon";
import type { CharacterChoice } from "./characterCatalog";
import { focusClothingPiece, useCharacterPreviewStore } from "./characterPreviewStore";
import { clothingPieceLabel, wornClothing, type ClothingPiece } from "./clothingPieces";

const FRAME = "M8 3H3v5m13-5h5v5m0 8v5h-5M3 16v5h5";
const BOOT = "M7 4h7v9l5 3v4H5v-5l2-3zM5 17h14";
const HAND = "M9 13V5a1 1 0 0 1 2 0v6-7a1 1 0 0 1 2 0v7-5a1 1 0 0 1 2 0v6-3a1 1 0 0 1 2 0v7l-2 4H9l-4-6a1 1 0 0 1 2-1l2 2";
const VIEW_ICONS: Record<string, string> = {
  "Full body": `${FRAME} M12 6h.01M8 10l4 1 4-1m-4 1v4m0 0-2 3m2-3 2 3`,
  Face: `${FRAME} M8 8l4-2 4 2v6l-4 3-4-3zm2 3h.01m4 0h.01m-3 3h2`,
  "Upper body": "M8 5l4 3 4-3 4 3-2 5-2-1v7H8v-7l-2 1-2-5zM12 8v11",
  Waist: "M7 5v5l-2 9h14l-2-9V5M6 13h4m4 0h4m-8-2h4v4h-4z",
  Hands: HAND,
  Feet: BOOT,
  Back: `${FRAME} M7 13l2-5 3-1 3 1 2 5m-5-6v10m-3-3h6`,
  Left: `${FRAME} M17 12H7m0 0 4-4m-4 4 4 4`,
  Right: `${FRAME} M7 12h10m0 0-4-4m4 4-4 4`,
};
const PIECE_ICONS: Record<ClothingPiece, string> = {
  corset: "M5 5l3 2 4 1 4-1 3-2-2 9 1 5-6 2-6-2 1-5zm4 4 6 7m0-7-6 7",
  shirt: "M8 4l4 2 4-2 5 3-2 5-3-1v9H8v-9l-3 1-2-5z",
  skirt: "M8 5h8l4 15H4zM8 8h8m-6 3-1 9m5-9 1 9",
  sleeves: "M9 5h6l5 11-4 2-3-7h-2l-3 7-4-2zm-4 9 4 2m6 0 4-2",
  underskirt: "M9 5h6l4 10H5zm-3 10-2 5h16l-2-5m-8 1-1 4m6-4 1 4",
  shorts: "M6 5h12l2 13h-6l-2-5-2 5H4zM6 8h12",
  shoes: BOOT,
  hat: "M7 15v-4a5 5 0 0 1 10 0v4M4 16h16l-2 3H6zm3-3h10",
  bow: "M10 10h4v4h-4zM10 10 4 7v10l6-3m4-4 6-3v10l-6-3",
  belt: "M4 10h6m4 0h6v4h-6m-4 0H4zM10 9h4v6h-4z",
  coat: "M8 4h8l5 6-3 3-2-2v9H8v-9l-2 2-3-3zm0 0 4 7 4-7m-4 7v9",
  pants: "M6 4h12l2 16h-6l-2-10-2 10H4zM6 7h12",
  gloves: `${HAND} M10 17h4`,
  collar: "M7 5h10l3 5-4 3-4-3-4 3-4-3zm5 5v8",
  pouches: "M6 7h12v12H6zM6 12l6 2 6-2m-8-5V4h4v3m-2 7v2",
  glasses: "M3 9h7l1 4-2 3H5l-2-3zm11 0h7v4l-2 3h-4l-2-3zm-3 3h2",
  bag: "M5 9h14l1 11H4zm4 0V6a3 3 0 0 1 6 0v3",
  dress: "M8 4h2l2 3 2-3h2l-1 7 4 9H5l4-9zm1 7h6",
  socks: "M8 4h6v9l4 3a2 2 0 0 1-1 4H8a2 2 0 0 1-2-2v-2l2-4zm0 3h6",
  harness: "M7 4h3l2 6 2-6h3v16h-3v-7h-4v7H7zm0 12h10",
  armor: "M7 4h3l2 3 2-3h3l2 5-2 2v8l-5 2-5-2v-8L5 9zM9 11h6m-6 4h6",
  bracer: "M8 5h8l1 14H7zM8 9h8m-8 4h8m-9 4h10",
};

function CameraChoiceIcon({ path }: { path: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={path} /></svg>;
}

export function FittingCameraSelect<View extends string>({ choice, views, view, onViewChange, label = "Preview camera", viewLabels }: {
  choice?: CharacterChoice;
  views: readonly View[];
  view: View;
  onViewChange: (view: View) => void;
  label?: string;
  viewLabels?: Partial<Record<View, string>>;
}) {
  const selected = useCharacterPreviewStore(state => state.selectedPiece);
  const pieces = choice ? wornClothing(choice) : [];

  return <div className="fitting-camera-select" role="group" aria-label={label}>
    <div className="fitting-camera-choices" role="group" aria-label="Views" data-controller-row data-controller-columns="7">
      {views.filter(item => item !== "Selected item").map(item => {
        const name = viewLabels?.[item] ?? item;
        const icon = item === "Whole car" ? <MenuIcon name="vehicles" />
          : item === "Full body" && !choice ? <MenuIcon name="cockpit" />
          : <CameraChoiceIcon path={VIEW_ICONS[item] ?? FRAME} />;
        return <button key={item} type="button" className="menu-control fitting-tool-icon" data-camera-choice={item}
          aria-label={name} title={name} aria-pressed={view === item} onClick={() => { if (view !== item) onViewChange(item); }}>{icon}</button>;
      })}
    </div>
    {pieces.length > 0 && <div className="fitting-camera-choices" role="group" aria-label="Clothing close-ups" data-controller-row data-controller-columns="7">
      {pieces.map(item => {
        const name = clothingPieceLabel(item);
        return <button key={item} type="button" className="menu-control fitting-tool-icon" data-camera-choice={`piece:${item}`}
          aria-label={name} title={name} aria-pressed={view === "Selected item" && item === selected}
          onClick={() => { if (view !== "Selected item" || item !== selected) focusClothingPiece(item); }}><CameraChoiceIcon path={PIECE_ICONS[item]} /></button>;
      })}
    </div>}
  </div>;
}
