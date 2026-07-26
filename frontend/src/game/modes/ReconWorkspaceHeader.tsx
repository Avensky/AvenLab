import { useMemo, type ReactNode } from "react";
import { GameButton } from "../../components/GameButton";

export type ReconHeaderTheme = "green" | "cyan" | "purple" | "red" | "yellow";

export type ReconHeaderTab = {
  id: string;
  label: string;
  disabled?: boolean;
  title?: string;
};

type ReconWorkspaceHeaderProps = {
  eyebrow: string;
  title: string;
  meta?: ReactNode;
  status?: ReactNode;
  tabs?: ReconHeaderTab[];
  showTabs?: boolean;
  activeTab?: string;
  activeLabel?: string;
  onTabChange?: (tabId: string) => void;
  actions?: ReactNode;
  theme?: ReconHeaderTheme;
  collapsible?: boolean;
  collapsed?: boolean;
  setCollapsed: (collapsed: boolean) => void;
  className?: string;
};

const THEME_CLASSES: Record<ReconHeaderTheme, {
  border: string;
  title: string;
  active: string;
  glow: string;
}> = {
  green: {
    border: "border-green-400/25",
    title: "text-green-100",
    active: "border-green-300 bg-green-500/20 text-green-100",
    glow: "shadow-green-500/10",
  },
  cyan: {
    border: "border-cyan-400/25",
    title: "text-cyan-100",
    active: "border-cyan-300 bg-cyan-500/20 text-cyan-100",
    glow: "shadow-cyan-500/10",
  },
  purple: {
    border: "border-purple-400/25",
    title: "text-purple-100",
    active: "border-purple-300 bg-purple-500/20 text-purple-100",
    glow: "shadow-purple-500/10",
  },
  red: {
    border: "border-red-300/30",
    title: "text-red-100",
    active: "border-red-300 bg-red-500/20 text-red-100",
    glow: "shadow-red-500/10",
  },
  yellow: {
    border: "border-yello-300/40",
    title: "text-yellow-100",
    active: "border-yellow-300 bg-yellow-500/10 text-yellow-100",
    glow: "shadow-yellow-500/10",
  },
};

export function ReconWorkspaceHeader({
  eyebrow,
  title,
//   meta,
  status,
  tabs = [],
  activeTab,
  activeLabel: activeLabelOverride,
  onTabChange,
  actions,
  theme = "green",
  showTabs,
  collapsed,
  setCollapsed,
  className = "",
}: ReconWorkspaceHeaderProps) {
  const tone = THEME_CLASSES[theme];
  const activeLabel = useMemo(
    () => activeLabelOverride
      ?? tabs.find((tab) => tab.id === activeTab)?.label
      ?? activeTab
      ?? "",
    [activeLabelOverride, activeTab, tabs],
  );

  if (collapsed) {
    return (
      <header
        className={`relative z-30 flex h-8 shrink-0 items-center justify-between border-b bg-slate-950/95 px-1.5 font-mono shadow-lg ${tone.border} ${tone.glow} ${className}`}
      >
        <div className="min-w-0 truncate text-[9px] text-slate-400">
          <span className={`font-black ${tone.title}`}>{title}</span>
          {activeLabel ? <span> · {activeLabel}</span> : null}
          {status ? <span className="hidden sm:inline"> · {status}</span> : null}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className={`ml-2 shrink-0 border bg-slate-900 px-2 py-0.5 text-[9px] font-black text-slate-200 ${tone.border}`}
          aria-label="Show workspace header"
          title="Show header"
        >
          HEADER ▾
        </button>
      </header>
    );
  }

  return (
    <header
      className={`relative z-30 shrink-0 border-b bg-slate-950/95 font-mono shadow-lg ${tone.border}  ${tone.glow} ${className}`}
    >
      <div className="grid min-w-0 gap-1 px-2 py-1 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,32rem)] lg:items-start">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[9px] uppercase tracking-[0.22em] text-yellow-300 sm:text-[px]">
                {eyebrow}
              </p>
              <h1 className={`truncate text-base font-black leading-tight sm:text-lg ${tone.title}`}>
                {title}
              </h1>
              {status ? (
                <div className="truncate text-[10px] leading-tight text-slate-500 sm:text-[11px]">
                {status ?? "READY"}
                </div>
            ) : null}

            </div>
            
                {actions ? (
                <div className="min-w-0 lg:w-full">
                    {actions}
                </div>
                ) : null}
            </div>
        </div>

      </div>

       {showTabs && tabs.length ? (
          <nav
            className="flex gap-1 py-0.5 bg-slate-900 border-slate-700 border"
            aria-label="Workspace navigation"
          >
            {tabs.map((tab) => (
              <GameButton
                key={tab.id}
                onPress={() => onTabChange?.(tab.id)}
                disabled={tab.disabled}
                title={tab.title}
                className={`rounded-sm border px-1.5 text-[9px] font-black transition disabled:cursor-not-allowed disabled:opacity-30 sm:text-[10px] ${activeTab === tab.id
                  ? tone.active
                  : "border-slate-700 bg-slate-950/95 text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                }`}
              >
                {tab.label}
              </GameButton>
            ))}
          </nav>
        ) : null}
    </header>
  );
}
