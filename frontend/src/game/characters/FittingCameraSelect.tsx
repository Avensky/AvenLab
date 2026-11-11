import { useLayoutEffect } from "react";
import type { CharacterChoice } from "./characterCatalog";
import { focusClothingPiece, useCharacterPreviewStore } from "./characterPreviewStore";
import { clothingPieceLabel, wornClothing } from "./clothingPieces";

export function FittingCameraSelect<View extends string>({ choice, views, view, onViewChange, label = "Preview camera", compact = false }: {
  choice: CharacterChoice;
  views: readonly View[];
  view: View;
  onViewChange: (view: View) => void;
  label?: string;
  compact?: boolean;
}) {
  const selected = useCharacterPreviewStore(state => state.selectedPiece);
  const pieces = wornClothing(choice);
  const piece = pieces.includes(selected) ? selected : pieces[0];

  useLayoutEffect(() => {
    if (view === "Selected item" && selected !== piece) focusClothingPiece(piece);
  }, [piece, selected, view]);

  return <label className="fitting-camera-select">{!compact && "Camera"}<select className="menu-control" aria-label={label}
    value={view === "Selected item" ? `piece:${piece}` : view}
    onChange={event => {
      const value = event.currentTarget.value;
      const nextPiece = pieces.find(item => `piece:${item}` === value);
      if (nextPiece) focusClothingPiece(nextPiece);
      else {
        const nextView = views.find(item => item === value);
        if (nextView) onViewChange(nextView);
      }
    }}>
    <optgroup label="Views">
      {views.filter(item => item !== "Selected item").map(item => <option key={item}>{item}</option>)}
    </optgroup>
    <optgroup label="Clothing close-ups">
      {pieces.map(item => <option key={item} value={`piece:${item}`}>{clothingPieceLabel(item)}</option>)}
    </optgroup>
  </select></label>;
}
