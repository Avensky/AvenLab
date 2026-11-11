import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { CHARACTER_APPEARANCE_OPTIONS, OUTFIT_THEMES, characterLook, type CharacterChoice } from "./characterCatalog";
import { clothingColors, clothingPieceLabel, withClothingColors, type ClothingPiece, type PieceColors } from "./clothingPieces";
import "./clothingColorToolbar.css";

const colorPresets = CHARACTER_APPEARANCE_OPTIONS.color.map(({ id, label, color }) => ({ label: id === "original" ? "White" : label, color }));

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
  const toolbar = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const focusPalette = useRef(false);
  const look = characterLook(choice)!;
  const colors = clothingColors(look, piece);
  const fabric = colors?.color ?? look.fabric;
  const trim = colors?.accent ?? colors?.color ?? look.trim;
  const pieceName = clothingPieceLabel(piece);
  const dye = (value?: PieceColors) => onChange(withClothingColors(choice, piece, value));
  const bars = [
    { label: "Main", value: fabric, apply: (color: string) => dye({ color, accent: trim }) },
    { label: "Accent", value: trim, apply: (accent: string) => dye({ accent }) },
  ];

  useEffect(() => {
    if (!open) return;
    if (focusPalette.current) toolbar.current?.querySelector<HTMLButtonElement>(".dressing-color-preset")?.focus();
    const closeOutside = (event: MouseEvent) => {
      if (event.target instanceof window.Node && !toolbar.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("click", closeOutside, true);
    return () => document.removeEventListener("click", closeOutside, true);
  }, [open]);

  return <section ref={toolbar} className="dressing-color-toolbar" aria-label="Clothing colors" onKeyDownCapture={event => {
    if (!open || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    toggle.current?.focus();
  }}>
    <div id={panelId} className="dressing-color-panel menu-panel-frame" hidden={!open}>
      <div className="dressing-color-bar" role="group" aria-label="Color combinations" data-controller-row>
        <span aria-hidden="true">Themes</span>
        <div className="dressing-color-chips">
          {OUTFIT_THEMES.map(theme => <button key={theme.name} type="button" className="menu-control menu-panel-frame dressing-color-preset"
            aria-label={theme.name} title={theme.name} aria-pressed={fabric === theme.color && trim === theme.accent}
            onClick={() => dye({ color: theme.color, accent: theme.accent })}>
            <i className="dressing-color-swatch" style={swatch(theme.color, theme.accent)} aria-hidden="true" />
          </button>)}
          <button type="button" className="menu-control menu-panel-frame dressing-color-reset" disabled={!colors}
            aria-label="Reset piece colors" title="Reset piece colors" onClick={() => dye()}>
            <svg className="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path d="M4 6v5h5M4.4 10a8 8 0 1 1 1.2 7" />
            </svg>
          </button>
        </div>
      </div>
      {bars.map(({ label, value, apply }) => <div key={label} className="dressing-color-bar" role="group" aria-label={`${label} color`} data-controller-row>
        <span aria-hidden="true">{label}</span>
        <div className="dressing-color-chips">
          {colorPresets.map(preset => <button key={preset.color} type="button" className="menu-control menu-panel-frame dressing-color-preset"
            aria-label={`${label} color: ${preset.label}`} title={preset.label} aria-pressed={value === preset.color}
            onClick={() => apply(preset.color)}>
            <i className="dressing-color-swatch" style={swatch(preset.color)} aria-hidden="true" />
          </button>)}
          <input type="color" aria-label={`Custom ${label.toLowerCase()} color`} title={`Custom ${label.toLowerCase()} color`} value={value}
            onChange={event => apply(event.currentTarget.value)} />
        </div>
      </div>)}
    </div>
    <div data-controller-row>
      <button ref={toggle} type="button" className="menu-control menu-panel-frame dressing-color-toggle" aria-expanded={open} aria-controls={panelId}
        aria-label={open ? "Close clothing colors" : "Open clothing colors"} title={`${pieceName} colors`} onClick={event => {
          focusPalette.current = event.detail === 0;
          setOpen(value => !value);
        }}>
        <i className="dressing-color-swatch" style={swatch(fabric, trim)} aria-hidden="true" />
      </button>
    </div>
  </section>;
}
