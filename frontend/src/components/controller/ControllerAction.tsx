import { ProgressOrbit } from "./ProgressOrbit";
import type { ComponentProps } from "react";
import { ControllerButton, type ControllerKey } from "./ControllerButton";

/** Shared clickable Xbox action. Glyph hints elsewhere stay non-interactive. */
export function ControllerAction({
  button,
  progress,
  progressClassName,
  className = "",
  children,
  type = "button",
  ...props
}: ComponentProps<"button"> & { button: ControllerKey; progress?:number|null; progressClassName?:string }) {
  return (
    <button {...props} type={type} className={`controller-action ${className}`}>
      {progress===undefined?<ControllerButton button={button}/>:<ProgressOrbit progress={progress} className={progressClassName}><ControllerButton button={button}/></ProgressOrbit>}
      {children}
    </button>
  );
}
