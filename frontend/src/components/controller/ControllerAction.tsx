import { ProgressOrbit } from "./ProgressOrbit";
import type { ComponentProps } from "react";
import type { ControllerKey } from "./ControllerButton";
import { ControlGlyph } from "./ControlGlyph";

/** Shared clickable menu action with a prompt for the selected input device. */
export function ControllerAction({
  button,
  keyboard,
  progress,
  progressClassName,
  className = "",
  children,
  type = "button",
  ...props
}: ComponentProps<"button"> & { button: ControllerKey; keyboard?: string | null; progress?:number|null; progressClassName?:string }) {
  const glyph = <ControlGlyph controller={button} keyboard={keyboard} />;
  return (
    <button {...props} type={type} className={`controller-action ${className}`}>
      {progress===undefined?glyph:<ProgressOrbit progress={progress} className={progressClassName}>{glyph}</ProgressOrbit>}
      {children}
    </button>
  );
}
