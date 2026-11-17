import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { CHARACTER_APPEARANCE_OPTIONS, OUTFIT_THEMES, characterLook, type CharacterChoice } from "./characterCatalog";
import { clothingColors, clothingPieceLabel, isUnderwearPiece, underwearColors, withClothingColors, type ClothingPiece, type PieceColors } from "./clothingPieces";
import { LACED_BODICE_FINISHES } from "./lacedBodiceAppearance";
import { SWEETHEART_DYE_GROUPS, SWEETHEART_DYE_SLOTS, sweetheartDyeColor } from "./sweetheartDye";
import { corsetModelUrl, corsetRenderChoice, isRebuiltLacedBodiceUrl, isRebuiltUnderbustUrl } from "./wardrobe";
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
  const underwear = isUnderwearPiece(piece) ? underwearColors(look, piece) : undefined;
  const corsetFit = piece === "corset" ? corsetRenderChoice(look) : undefined;
  const corset = corsetModelUrl(corsetFit, "garage");
  const rebuilt = Boolean(corset && isRebuiltUnderbustUrl(corset));
  const laced = Boolean(corset && isRebuiltLacedBodiceUrl(corset));
  const sweetheartFit = piece === "corset" ? corsetFit ?? look.wardrobe : undefined;
  const sweetheart = sweetheartFit?.set === "gothic-02";
  const outfitFabric = look.appearance.color === "original" ? undefined : look.fabric;
  const dye = (value?: PieceColors) => onChange(withClothingColors(choice, piece, value));
  const sweetheartBars = sweetheart ? SWEETHEART_DYE_SLOTS.filter(slot => slot !== "accent" || sweetheartFit.waist === "over")
    .map(slot => {
      const { key, label, original } = SWEETHEART_DYE_GROUPS[slot];
      const value = sweetheartDyeColor(slot, colors, outfitFabric, look.appearance.accent) ?? original;
      return { label, value, apply: (color: string) => dye({ [key]: color }) };
    }) : undefined;
  const fabric = sweetheartBars?.[0].value ?? underwear?.color ?? colors?.color
    ?? (laced ? outfitFabric ?? "#6e6660" : rebuilt ? outfitFabric ?? "#30282a" : look.fabric);
  const trim = sweetheartBars?.[1].value ?? underwear?.accent ?? (laced ? colors?.laces ?? colors?.accent ?? look.appearance.accent ?? "#cdb693"
    : colors?.accent ?? (rebuilt ? look.appearance.accent ?? "#362d2c" : colors?.color ?? look.trim));
  const pieceName = clothingPieceLabel(piece);
  const bars = sweetheartBars ?? (laced ? [
    { label: "Fabric", value: fabric, apply: (color: string) => dye({ color }) },
    { label: "Trim", value: colors?.panel ?? outfitFabric ?? "#635a54", apply: (panel: string) => dye({ panel }) },
    { label: "Laces", value: trim, apply: (laces: string) => dye({ laces }) },
    { label: "Eyelets", value: colors?.hardware ?? "#b18e61", apply: (hardware: string) => dye({ hardware }) },
    ...(corsetFit?.waist === "over" ? [
      { label: "Zipper", value: colors?.closure ?? "#a6906f", apply: (closure: string) => dye({ closure }) },
    ] : []),
  ] : [
    { label: "Main", value: fabric, apply: (color: string) => dye(rebuilt || underwear ? { color } : { color, accent: trim }) },
    { label: rebuilt ? "Binding" : "Accent", value: trim, apply: (accent: string) => dye({ accent }) },
    ...(rebuilt ? [
      { label: "Front panel", value: colors?.panel ?? outfitFabric ?? "#40302c", apply: (panel: string) => dye({ panel }) },
      { label: "Lining", value: colors?.lining ?? outfitFabric ?? "#2a262b", apply: (lining: string) => dye({ lining }) },
      { label: "Hardware", value: colors?.hardware ?? "#ad8451", apply: (hardware: string) => dye({ hardware }) },
    ] : []),
  ]);

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
            aria-label={theme.name} title={theme.name} aria-pressed={fabric === theme.color && trim === theme.accent
              && (!sweetheartBars || sweetheartBars.slice(2).every(({ value }) => value === theme.accent))}
            onClick={() => dye(sweetheart ? { color: theme.color, laces: theme.accent, panel: theme.accent, hardware: theme.accent, closure: theme.accent }
              : laced ? { color: theme.color, panel: theme.color, laces: theme.accent }
              : rebuilt ? { color: theme.color, accent: theme.accent, panel: theme.color, lining: theme.color, hardware: theme.accent }
              : { color: theme.color, accent: theme.accent })}>
            <i className="dressing-color-swatch" style={swatch(theme.color, theme.accent)} aria-hidden="true" />
          </button>)}
          <button type="button" className="menu-control menu-panel-frame dressing-color-reset" disabled={!colors}
            aria-label={laced ? "Reset piece appearance" : "Reset piece colors"}
            title={laced ? "Reset piece appearance" : "Reset piece colors"} onClick={() => dye()}>
            <svg className="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path d="M4 6v5h5M4.4 10a8 8 0 1 1 1.2 7" />
            </svg>
          </button>
        </div>
      </div>
      {laced && <div className="dressing-color-bar" role="group" aria-label="Fabric finish" data-controller-row>
        <span aria-hidden="true">Finish</span>
        <div className="dressing-color-chips">
          {LACED_BODICE_FINISHES.map(({ id, label }) => <button key={id} type="button"
            className="menu-control menu-panel-frame dressing-color-finish"
            aria-pressed={(colors?.finish ?? "original") === id}
            onClick={() => dye({ finish: id })}>{label}</button>)}
        </div>
      </div>}
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
