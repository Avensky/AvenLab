import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { getSelectionClasses } from "./menus/selectionStyles";

type GameButtonProps = Omit<HTMLAttributes<HTMLDivElement>, "children" | "onFocus"> & {
  children: ReactNode;
  onPress?: () => void;
  onFocus?: () => void;
  disabled?: boolean;
  selected?: boolean;
  variant?: "primary" | "secondary" | "danger" | "warning" | "neutral" | "selector" | "menu";
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
      ...rest
    },
    ref
  ) {
    const base =
      "select-none border text-left font-bold transition ";

    const variants = {
      menu: "menu-control",
      primary:
        "border-cyan-300/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-400/20",
      secondary:
        "border-slate-500/40 bg-slate-800/60 text-slate-100 hover:bg-slate-700/70",
      danger:
        "border-red-400/40 bg-red-500/10 text-red-100 hover:bg-red-500/20",
      warning:
        "border-yellow-300/40 bg-yellow-500/10 text-yellow-100 hover:bg-yellow-400/20",
      neutral:
        `${getSelectionClasses(selected, true)} text-cyan-100 outline-none hover:border-cyan-300/45 hover:bg-cyan-500/10 focus-visible:border-cyan-300/45 focus-visible:bg-cyan-500/10`,
      selector:
        `${getSelectionClasses(selected)} text-cyan-100 hover:border-cyan-300/45 hover:bg-[radial-gradient(ellipse_at_center,_rgba(30,41,59,0.72)_20%,_rgba(8,47,73,0.3)_60%,_rgba(2,6,23,0.9)_100%)] hover:shadow-[inset_0_0_18px_rgba(0,0,0,0.55),0_0_12px_rgba(34,211,238,0.08)]`,
    };

    return (
      <div
        {...rest}
        ref={ref}
        role="button"
        data-selected={selected}
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || rest["aria-disabled"] || false}
        className={`${base} ${variants[variant]} ${selected && variant !== "neutral" && variant !== "selector" && variant !== "menu" ? "ring-2 ring-yellow-300/80 bg-yellow-400/10" : ""
          } ${disabled ? "pointer-events-none opacity-40" : "cursor-pointer"} ${className} px-1`}
        onPointerEnter={() => { if (!disabled) onFocus?.(); }}
        onFocus={() => { if (!disabled) onFocus?.(); }}
        onPointerDown={(e) => e.preventDefault()}
        onPointerUp={(e) => {
          e.preventDefault();
          if (!disabled && (e.pointerType !== "mouse" || e.button === 0)) onPress?.();
        }}
        onKeyDown={(e) => {
          if (disabled) return;

          if (e.code === "Enter" || e.code === "Space") {
            e.preventDefault();
            // The focused button owns activation; window listeners must not
            // also select another row or treat Space as braking.
            e.stopPropagation();
            if (!e.repeat) onPress?.();
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {children}
      </div>
    );
  }
);
