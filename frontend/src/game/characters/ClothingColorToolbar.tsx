import { useId, useRef, useState, type CSSProperties } from "react";
import { CHARACTER_APPEARANCE_OPTIONS, OUTFIT_THEMES, characterLook, type CharacterChoice } from "./characterCatalog";
import { clothingColors, clothingPieceLabel, withClothingColors, type ClothingPiece, type PieceColors } from "./clothingPieces";

function swatch(color: string, accent = color) {
  return { "--swatch-color": color, "--swatch-accent": accent } as CSSProperties;
}

export function ClothingColorToolbar({ choice, piece, onChange }: {
  choice: CharacterChoice;
  piece: ClothingPiece;
  onChange: (next: CharacterChoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const look = characterLook(choice)!;
  const colors = clothingColors(look, piece);
  const fabric = colors?.color ?? look.fabric;
  const trim = colors?.accent ?? colors?.color ?? look.trim;
  const pieceName = clothingPieceLabel(piece);
  const dye = (value?: PieceColors) => onChange(withClothingColors(choice, piece, value));

  return <section className="dressing-color-toolbar" aria-label="Clothing colors" onKeyDownCapture={event => {
    if (!open || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    toggle.current?.focus();
  }}>
    <div data-controller-row>
      <button ref={toggle} type="button" className="menu-control dressing-color-toggle" aria-expanded={open} aria-controls={panelId}
        aria-label={open ? "Close clothing colors" : "Open clothing colors"} onClick={() => setOpen(value => !value)}>
        <i className="dressing-color-swatch" style={swatch(fabric, trim)} aria-hidden="true" />
        <span>Colors</span><span className="dressing-color-piece">{pieceName}</span><span aria-hidden="true">{open ? "▾" : "▴"}</span>
      </button>
    </div>
    <div id={panelId} className="dressing-color-panel" hidden={!open}>
      <fieldset>
        <legend>{pieceName} color combinations</legend>
        <div className="dressing-color-presets" data-controller-row data-controller-columns="2">
          {OUTFIT_THEMES.map(theme => <button key={theme.name} type="button" className="menu-control dressing-color-preset"
            aria-pressed={fabric === theme.color && trim === theme.accent}
            onClick={() => dye({ color: theme.color, accent: theme.accent })}>
            <i className="dressing-color-swatch" style={swatch(theme.color, theme.accent)} aria-hidden="true" />
            <span>{theme.name}</span>
          </button>)}
        </div>
      </fieldset>
      <fieldset>
        <legend>Fabric presets</legend>
        <div className="dressing-color-presets" data-controller-row data-controller-columns="2">
          {CHARACTER_APPEARANCE_OPTIONS.color.flatMap(option => "color" in option && option.color ? [
            <button key={option.id} type="button" className="menu-control dressing-color-preset"
              aria-pressed={fabric === option.color} onClick={() => dye({ color: option.color, accent: trim })}>
              <i className="dressing-color-swatch" style={swatch(option.color)} aria-hidden="true" />
              <span>{option.label}</span>
            </button>,
          ] : [])}
        </div>
      </fieldset>
      <div className="dressing-color-custom" data-controller-row>
        <label>Fabric<input type="color" aria-label="Selected item fabric color" value={fabric}
          onChange={event => dye({ color: event.currentTarget.value, accent: trim })} /></label>
        <label>Trim<input type="color" aria-label="Selected item trim color" value={trim}
          onChange={event => dye({ accent: event.currentTarget.value })} /></label>
        <button type="button" className="menu-control" disabled={!colors} onClick={() => dye()}>Reset piece</button>
      </div>
    </div>
  </section>;
}
