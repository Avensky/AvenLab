import { GameButton } from "../../components/GameButton";

export type ReconHeaderActionTone =
  | "slate"
  | "green"
  | "cyan"
  | "purple"
  | "yellow"
  | "red";

export type ReconHeaderActionItem = {
  id: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  tone?: ReconHeaderActionTone;
};

type ReconHeaderActionGridProps = {
  items: ReconHeaderActionItem[];
  ariaLabel?: string;
};

const TONE_CLASSES: Record<ReconHeaderActionTone, string> = {
  slate: "border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-900",
  green: "border-green-300/40 bg-green-500/10 text-green-100 hover:bg-green-400/20",
  cyan: "border-cyan-300/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-400/20",
  purple: "border-purple-300/40 bg-purple-500/10 text-purple-100 hover:bg-purple-400/20",
  yellow: "border-yellow-300/40 bg-yellow-500/10 text-yellow-100 hover:bg-yellow-400/20",
  red: "border-red-300/40 bg-red-500/10 text-red-100 hover:bg-red-400/20",
};

const ACTIVE_CLASSES: Record<ReconHeaderActionTone, string> = {
  slate: "border-slate-300 bg-slate-700/60 text-white",
  green: "border-green-200 bg-green-500/30 text-green-50",
  cyan: "border-cyan-200 bg-cyan-500/30 text-cyan-50",
  purple: "border-purple-200 bg-purple-500/30 text-purple-50",
  yellow: "border-yellow-200 bg-yellow-500/30 text-yellow-50",
  red: "border-red-200 bg-red-500/30 text-red-50",
};

export function ReconHeaderActionGrid({
  items,
  ariaLabel = "Workspace actions",
}: ReconHeaderActionGridProps) {
  return (
    <nav
      className="grid w-full grid-cols-3 gap-0.5"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const tone = item.tone ?? "slate";
        return (
          <GameButton
            key={item.id}
            onPress={item.onPress}
            disabled={item.disabled}
            title={item.title}
            className={`rounded-sm flex justify-center border text-[9px] font-black transition disabled:cursor-not-allowed disabled:opacity-30 sm:text-[10px] ${
              item.active ? ACTIVE_CLASSES[tone] : TONE_CLASSES[tone]
            }`}
          >
            {item.label}
          </GameButton>
        );
      })}
    </nav>
  );
}
