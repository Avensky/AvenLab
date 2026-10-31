export function UtilityToggle({
  panel,
  open,
  onClick,
  className = "",
}: {
  panel: "radio" | "climate";
  open: boolean;
  onClick: () => void;
  className?: string;
}) {
  const label = panel === "radio" ? "radio" : "climate controls";
  return (
    <button
      type="button"
      className={`utility-toggle ${className}`}
      aria-label={`${open ? "Minimize" : "Open"} ${label}`}
      title={`${open ? "Minimize" : "Open"} ${label}`}
      aria-expanded={open}
      onClick={onClick}
    >
      {open ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      ) : panel === "radio" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 8h14v11H5zM7 5l10-3M8 12h5M8 15h3" />
          <circle cx="16" cy="15" r="1.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9 5l3 3 3-3M9 19l3-3 3 3" />
        </svg>
      )}
    </button>
  );
}
