import { PreviewCameraSelect, type PreviewCameraSelectProps } from "../preview/PreviewCameraSelect";
import { PreviewToolButton } from "../preview/PreviewToolButton";
import { PREVIEW_BOOT_ICON, PREVIEW_HAND_ICON, PreviewCameraChoiceIcon } from "../preview/PreviewToolIcon";
import type { CharacterChoice } from "./characterCatalog";
import { focusClothingPiece, useCharacterPreviewStore } from "./characterPreviewStore";
import { clothingPieceLabel, wornClothing, type ClothingPiece } from "./clothingPieces";

const PIECE_ICONS: Record<ClothingPiece, string> = {
  corset: "M5 5l3 2 4 1 4-1 3-2-2 9 1 5-6 2-6-2 1-5zm4 4 6 7m0-7-6 7",
  shirt: "M8 4l4 2 4-2 5 3-2 5-3-1v9H8v-9l-3 1-2-5z",
  bra: "M3 9c3 0 3-2 5-2s3 3 4 3 2-3 4-3 2 2 5 2v7H3zm0 5h18",
  skirt: "M8 5h8l4 15H4zM8 8h8m-6 3-1 9m5-9 1 9",
  sleeves: "M9 5h6l5 11-4 2-3-7h-2l-3 7-4-2zm-4 9 4 2m6 0 4-2",
  underskirt: "M9 5h6l4 10H5zm-3 10-2 5h16l-2-5m-8 1-1 4m6-4 1 4",
  shorts: "M6 5h12l2 13h-6l-2-5-2 5H4zM6 8h12",
  briefs: "M4 7h16v4c-4 0-5 3-6 6h-4c-1-3-2-6-6-6zm0 3h16",
  shoes: PREVIEW_BOOT_ICON,
  hat: "M7 15v-4a5 5 0 0 1 10 0v4M4 16h16l-2 3H6zm3-3h10",
  bow: "M10 10h4v4h-4zM10 10 4 7v10l6-3m4-4 6-3v10l-6-3",
  belt: "M4 10h6m4 0h6v4h-6m-4 0H4zM10 9h4v6h-4z",
  coat: "M8 4h8l5 6-3 3-2-2v9H8v-9l-2 2-3-3zm0 0 4 7 4-7m-4 7v9",
  pants: "M6 4h12l2 16h-6l-2-10-2 10H4zM6 7h12",
  gloves: `${PREVIEW_HAND_ICON} M10 17h4`,
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

export function FittingWearableShortcuts({ pieces, active, vertical = false, onSelect }: {
  pieces: readonly ClothingPiece[];
  active?: ClothingPiece;
  vertical?: boolean;
  onSelect: (piece: ClothingPiece) => void;
}) {
  if (!pieces.length) return null;
  return <div className={vertical ? "dressing-wearable-shortcuts fitting-camera-toolbar" : "fitting-camera-choices"}
    role="group" aria-label="Clothing close-ups" data-controller-row data-controller-columns={vertical ? 1 : 7}>
    {pieces.map(piece => {
      const label = clothingPieceLabel(piece);
      return <PreviewToolButton key={piece} label={label}
        data-camera-choice={`piece:${piece}`} data-wearable-quick-select={vertical ? piece : undefined}
        aria-pressed={active === piece}
        onClick={() => onSelect(piece)}><PreviewCameraChoiceIcon path={PIECE_ICONS[piece]} /></PreviewToolButton>;
    })}
  </div>;
}

export function FittingCameraSelect<View extends string>({ choice, views, ...props }: PreviewCameraSelectProps<View> & {
  choice?: CharacterChoice;
}) {
  const selected = useCharacterPreviewStore(state => choice ? state.selectedPiece : undefined);
  const pieces = choice ? wornClothing(choice) : [];
  return <PreviewCameraSelect {...props} views={views.filter(view => view !== "Selected item")} showDriverIcon={!choice}>
    <FittingWearableShortcuts pieces={pieces} active={props.view === "Selected item" ? selected : undefined}
      onSelect={item => { if (props.view !== "Selected item" || item !== selected) focusClothingPiece(item); }} />
  </PreviewCameraSelect>;
}
