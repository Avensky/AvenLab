import { turnCharacter, turnVehicle } from "./fittingControlsStore";
function RotateArrow({ right = false, outer = false }: { right?: boolean; outer?: boolean }) {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" style={right ? { transform: "scaleX(-1)" } : undefined}>
    <path d="M5 8a8 8 0 1 1-1 7M5 3v5h5" />{outer && <path d="M2 11a10 10 0 0 0 18 7" />}
  </svg>;
}
export function FittingRotationControls({ vehicle = false, disabled = false }: { vehicle?: boolean; disabled?: boolean }) {
  return <div className="fitting-rotation-grid" role="group" aria-label="Rotate models">
    <button type="button" className="menu-control" disabled={!vehicle || disabled} aria-label="Rotate vehicle left" title={vehicle ? "Rotate vehicle left" : "Vehicle rotation is available in the garage"} onClick={() => turnVehicle(-1)}><RotateArrow outer /><small>Vehicle</small></button>
    <button type="button" className="menu-control" disabled={disabled} aria-label="Rotate character left" onClick={() => turnCharacter(-1)}><RotateArrow /><small>Character</small></button>
    <button type="button" className="menu-control" disabled={disabled} aria-label="Rotate character right" onClick={() => turnCharacter(1)}><RotateArrow right /><small>Character</small></button>
    <button type="button" className="menu-control" disabled={!vehicle || disabled} aria-label="Rotate vehicle right" title={vehicle ? "Rotate vehicle right" : "Vehicle rotation is available in the garage"} onClick={() => turnVehicle(1)}><RotateArrow right outer /><small>Vehicle</small></button>
  </div>;
}
