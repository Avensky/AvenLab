import type { CSSProperties } from "react";
import "./colorSwatch.css";

type SwatchColors = { color: string; accent?: string };

export function ColorSwatch({ color, accent = color }: SwatchColors) {
  return <i className="color-swatch" style={{ "--swatch-color": color, "--swatch-accent": accent } as CSSProperties}
    aria-hidden="true" />;
}

export function ColorSwatchButton({ color, accent, label, title = label, pressed, disabled, className, onClick }: SwatchColors & {
  label: string;
  title?: string;
  pressed: boolean;
  disabled?: boolean;
  className: string;
  onClick: () => void;
}) {
  return <button type="button" className={className} aria-label={label} title={title} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
    <ColorSwatch color={color} accent={accent} />
  </button>;
}
