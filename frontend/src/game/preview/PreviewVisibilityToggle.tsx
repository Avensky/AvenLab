import { useGarageDrive } from "./garageDriveStore";

export function PreviewVisibilityToggle({ hidden: override, onToggle }: { hidden?: boolean; onToggle?: () => void } = {}) {
  const garageHidden = useGarageDrive(state => state.panelsHidden);
  const hidden = override ?? garageHidden;
  const label = hidden ? "Show interface" : "Hide interface";
  return <button type="button" className="menu-control garage-hide-toggle" aria-label={label}
    aria-pressed={hidden} title={label} onClick={onToggle ?? (() => useGarageDrive.setState({ panelsHidden: !hidden }))}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
      {hidden && <path d="m4 3 16 18" />}
    </svg>
  </button>;
}
