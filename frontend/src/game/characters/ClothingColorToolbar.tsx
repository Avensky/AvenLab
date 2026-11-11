import { FitBadge } from "./FitReview";
import { characterLook, type CharacterChoice } from "./characterCatalog";
import { clothingColors, clothingPieceLabel, wornClothing, withClothingColors, type ClothingPiece } from "./clothingPieces";
import { focusClothingPiece, useCharacterPreviewStore } from "./characterPreviewStore";

export function ClothingColorToolbar({ choice, onChange }: { choice: CharacterChoice; onChange: (next: CharacterChoice) => void }) {
  const look = characterLook(choice)!;
  const selected = useCharacterPreviewStore(s => s.selectedPiece);
  const pieces = wornClothing(choice);
  const piece = pieces.includes(selected) ? selected : pieces[0];
  const colors = clothingColors(look, piece);
  return <section className="dressing-color-toolbar" aria-label="Selected clothing colors" data-controller-row>
    <label className="dressing-piece-select">Clothing piece<select className="menu-control" aria-label="Clothing piece" value={piece}
      onChange={event => focusClothingPiece(event.target.value as ClothingPiece)}>
      {pieces.map(item => <option key={item} value={item}>{clothingPieceLabel(item)}</option>)}
    </select></label>
    <FitBadge choice={choice} piece={piece} />
    <label>Fabric<input type="color" aria-label="Selected item fabric color" value={colors?.color ?? look.fabric}
      onChange={event => onChange(withClothingColors(choice, piece, { color: event.target.value }))} /></label>
    <label>Trim<input type="color" aria-label="Selected item trim color" value={colors?.accent ?? colors?.color ?? look.trim}
      onChange={event => onChange(withClothingColors(choice, piece, { accent: event.target.value }))} /></label>
    <button type="button" className="menu-control" aria-label="Inspect selected clothing" onClick={() => focusClothingPiece(piece)}>Inspect</button>
    <button type="button" className="menu-control" disabled={!colors} onClick={() => onChange(withClothingColors(choice, piece))}>Reset piece</button>
  </section>;
}
