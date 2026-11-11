import { useLayoutEffect } from "react";
import type { CharacterChoice } from "./characterCatalog";
import { focusClothingPiece, useCharacterPreviewStore } from "./characterPreviewStore";
import { clothingPieceLabel, wornClothing } from "./clothingPieces";

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
  const piece = pieces.includes(selected) ? selected : pieces[0];

  useLayoutEffect(() => {
    if (view === "Selected item" && piece && selected !== piece) focusClothingPiece(piece);
  }, [piece, selected, view]);

  return <div className="fitting-camera-select" role="group" aria-label={label}>
    <div className="fitting-camera-choices" role="group" aria-label="Views" data-controller-row data-controller-columns="2">
      {views.filter(item => item !== "Selected item").map(item => <button key={item} type="button" className="menu-control"
        data-camera-choice={item} aria-pressed={view === item} onClick={() => { if (view !== item) onViewChange(item); }}>{viewLabels?.[item] ?? item}</button>)}
    </div>
    {pieces.length > 0 && <>
      <small aria-hidden="true">Clothing close-ups</small>
      <div className="fitting-camera-choices" role="group" aria-label="Clothing close-ups" data-controller-row data-controller-columns="2">
        {pieces.map(item => <button key={item} type="button" className="menu-control" data-camera-choice={`piece:${item}`}
          aria-pressed={view === "Selected item" && item === piece}
          onClick={() => { if (view !== "Selected item" || item !== piece) focusClothingPiece(item); }}>{clothingPieceLabel(item)}</button>)}
      </div>
    </>}
  </div>;
}
