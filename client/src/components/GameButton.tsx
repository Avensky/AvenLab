import { forwardRef, type ReactNode } from "react";

type GameButtonProps = {
  children: ReactNode;
  onPress?: () => void;
  onFocus?: () => void;
  disabled?: boolean;
  selected?: boolean;
  variant?: "primary" | "secondary" | "danger" | "warning";
  className?: string;
};

export const GameButton = forwardRef<HTMLDivElement, GameButtonProps>(
  function GameButton(
    {
      children,
      onPress,
      onFocus,
      disabled = false,
      selected = false,
      variant = "primary",
      className = "",
    },
    ref
  ) {
    const base =
      "select-none rounded-xl border px-3 py-2 text-left font-bold transition active:scale-[0.99]";

    const variants = {
      primary:
        "border-cyan-300/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-400/20",
      secondary:
        "border-slate-500/40 bg-slate-800/60 text-slate-100 hover:bg-slate-700/70",
      danger:
        "border-red-400/40 bg-red-500/10 text-red-100 hover:bg-red-500/20",
      warning:
        "border-yellow-300/40 bg-yellow-500/10 text-yellow-100 hover:bg-yellow-400/20",
    };

    return (
      <div
        ref={ref}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        className={`${base} ${variants[variant]} ${
          selected ? "ring-2 ring-yellow-300/80 bg-yellow-400/10" : ""
        } ${disabled ? "pointer-events-none opacity-40" : "cursor-pointer"} ${className}`}
        onPointerEnter={onFocus}
        onPointerDown={(e) => e.preventDefault()}
        onPointerUp={(e) => {
          e.preventDefault();
          if (!disabled) onPress?.();
        }}
        onKeyDown={(e) => {
          if (disabled) return;

          if (e.code === "Enter" || e.code === "Space") {
            e.preventDefault();
            onPress?.();
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {children}
      </div>
    );
  }
); 