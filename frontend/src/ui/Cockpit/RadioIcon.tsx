type Transport =
  | "previous"
  | "next"
  | "play"
  | "pause"
  | "restart"
  | "source"
  | "power";
/** Vector transport icons render consistently without an emoji/font dependency. */
export function RadioIcon({ name }: { name: Transport }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "previous" ? (
        <>
          <path d="M5 5v14" />
          <path d="m19 5-11 7 11 7Z" fill="currentColor" />
        </>
      ) : name === "next" ? (
        <>
          <path d="M19 5v14" />
          <path d="m5 5 11 7-11 7Z" fill="currentColor" />
        </>
      ) : name === "play" ? (
        <path d="m8 5 11 7-11 7Z" fill="currentColor" />
      ) : name === "pause" ? (
        <path d="M8 5v14M16 5v14" strokeWidth="3" />
      ) : name === "restart" ? (
        <>
          <path d="M5 8a8 8 0 1 1-1 8" />
          <path d="M4 3v6h6" />
        </>
      ) : name === "power" ? (
        <>
          <path d="M12 3v9" />
          <path d="M6.3 5.7a8 8 0 1 0 11.4 0" />
        </>
      ) : (
        <path d="M12 4v16M4 12h16" />
      )}
    </svg>
  );
}
