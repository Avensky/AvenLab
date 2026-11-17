import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ColorSwatch, ColorSwatchButton } from "../../components/menus/ColorSwatch";
import { CHARACTER_APPEARANCE_OPTIONS, OUTFIT_THEMES, characterLook, type CharacterChoice } from "./characterCatalog";
import { clothingColors, clothingPieceLabel, isUnderwearPiece, underwearColors, withClothingColors, type ClothingPiece, type PieceColors } from "./clothingPieces";
import { getCorsetDyeProfile, resolveCorsetDye, type CorsetDyeGroup } from "./corsetDye";
import "./clothingColorToolbar.css";

const colorPresets = CHARACTER_APPEARANCE_OPTIONS.color.map(({ id, label, color }) => ({ label: id === "original" ? "White" : label, color }));
const presetClass = "menu-control menu-panel-frame dressing-color-preset";
type DyeRow = Pick<CorsetDyeGroup, "key" | "label" | "theme"> & { value: string };

function PaletteRow({ label, group, children }: { label: string; group: string; children: ReactNode }) {
  return <div className="dressing-color-bar" role="group" aria-label={group} data-controller-row>
    <span aria-hidden="true">{label}</span>
    <div className="dressing-color-chips">{children}</div>
  </div>;
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  const customLabel = `Custom ${label.toLowerCase()} color`;
  return <PaletteRow label={label} group={`${label} color`}>
    {colorPresets.map(preset => <ColorSwatchButton key={preset.color} color={preset.color} className={presetClass}
      label={`${label} color: ${preset.label}`} title={preset.label} pressed={value === preset.color}
      onClick={() => onChange(preset.color)} />)}
    <input type="color" aria-label={customLabel} title={customLabel} value={value}
      onChange={event => onChange(event.currentTarget.value)} />
  </PaletteRow>;
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
  const profile = piece === "corset" ? getCorsetDyeProfile(look) : undefined;
  const outfitFabric = look.appearance.color === "original" ? undefined : look.fabric;
  const rows: DyeRow[] = profile?.groups.map(group => ({
    ...group, value: resolveCorsetDye(group, colors, outfitFabric, look.appearance.accent) ?? group.original,
  })) ?? [
    { key: "color", label: "Main", value: underwear?.color ?? colors?.color ?? look.fabric, theme: "color" },
    { key: "accent", label: "Accent", value: underwear?.accent ?? colors?.accent ?? colors?.color ?? look.trim, theme: "accent" },
  ];
  const fabric = rows[0].value;
  const trim = rows.find(row => row.theme === "accent")?.value ?? fabric;
  const resetLabel = profile?.finishes ? "Reset piece appearance" : "Reset piece colors";
  const dye = (value?: PieceColors) => onChange(withClothingColors(choice, piece, value));
  const pieceName = clothingPieceLabel(piece);

  function applyTheme(theme: typeof OUTFIT_THEMES[number]) {
    const next: PieceColors = {};
    for (const group of profile?.themeGroups ?? rows) {
      if (group.theme) next[group.key] = theme[group.theme];
    }
    dye(next);
  }

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
      {open && <>
        <PaletteRow label="Themes" group="Color combinations">
          {OUTFIT_THEMES.map(theme => <ColorSwatchButton key={theme.name} className={presetClass} color={theme.color} accent={theme.accent}
            label={theme.name} pressed={rows.every(row => !row.theme || row.value === theme[row.theme])}
            onClick={() => applyTheme(theme)} />)}
          <button type="button" className="menu-control menu-panel-frame dressing-color-reset" disabled={!colors}
            aria-label={resetLabel} title={resetLabel} onClick={() => dye()}>
            <svg className="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path d="M4 6v5h5M4.4 10a8 8 0 1 1 1.2 7" />
            </svg>
          </button>
        </PaletteRow>
        {profile?.finishes && <PaletteRow label="Finish" group="Fabric finish">
          {profile.finishes.map(({ id, label }) => <button key={id} type="button"
            className="menu-control menu-panel-frame dressing-color-finish"
            aria-pressed={(colors?.finish ?? "original") === id}
            onClick={() => dye({ finish: id })}>{label}</button>)}
        </PaletteRow>}
        {rows.map(({ key, label, value }) => <ColorRow key={key} label={label} value={value}
          onChange={color => dye(key === "color" && !profile && !underwear ? { color, accent: trim } : { [key]: color })} />)}
      </>}
    </div>
    <div data-controller-row>
      <button ref={toggle} type="button" className="menu-control menu-panel-frame dressing-color-toggle" aria-expanded={open} aria-controls={panelId}
        aria-label={open ? "Close clothing colors" : "Open clothing colors"} title={`${pieceName} colors`} onClick={event => {
          focusPalette.current = event.detail === 0;
          setOpen(value => !value);
        }}>
        <ColorSwatch color={fabric} accent={trim} />
      </button>
    </div>
  </section>;
}
