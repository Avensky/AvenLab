import { GameButton } from "../../components/GameButton";
import { useSelectionStore, useUIStore } from "../../store";

type MapSelectorProps = {
    menuIndex?: number;
    menuId?: "sandbox_setup" | "signal_recon_setup";
    showName?: boolean;
    showDesc?: boolean;
};

export function MapSelector({
    menuIndex = 1,
    menuId = "signal_recon_setup",
    showName = true,
    showDesc = true,
}: MapSelectorProps) {
    const map = useSelectionStore((s) => s.getSelectedMap());
    const previousMap = useSelectionStore((s) => s.prevMap);
    const nextMap = useSelectionStore((s) => s.nextMap);

    const selectedIndex = useUIStore(
        (s) => s.selectedMenuIndexById[menuId]
    );
    const setActiveMenuIndex = useUIStore(
        (s) => s.setActiveMenuIndex
    );

    const selected = selectedIndex === menuIndex;

    return (
        <div
            className={`border-t px-4 pb-1 transition-[background,border-color,box-shadow] duration-200 ${
                selected
                    ? "border-cyan-300/45 bg-[radial-gradient(ellipse_at_center,_rgba(30,41,59,0.72)_20%,_rgba(8,47,73,0.3)_60%,_rgba(2,6,23,0.9)_100%)] shadow-[inset_0_0_18px_rgba(0,0,0,0.55),0_0_12px_rgba(34,211,238,0.08)]"
                    : "border-slate-800/80 bg-slate-950/90 shadow-[inset_0_0_30px_rgba(0,0,0,0.9)]"
            }`}
            onPointerEnter={() => setActiveMenuIndex(menuIndex)}
            onFocusCapture={() => setActiveMenuIndex(menuIndex)}
        >
            <p
                className={`text-xs uppercase transition-colors duration-200 ${
                    selected
                        ? "text-slate-400"
                        : "text-slate-600"
                }`}
            >
                Map
            </p>

            <div className="flex items-center justify-between gap-3">
                <GameButton
                    variant="secondary"
                    onPress={previousMap}
                    className="h-7"
                    aria-label="Previous map"
                >
                    ◀
                </GameButton>

                <div className="min-w-0 flex-1 text-center">
                    {showName && (
                        <h2
                            className={`truncate text-2xl font-black transition-colors duration-200 ${
                                selected
                                    ? "text-cyan-100"
                                    : "text-slate-500"
                            }`}
                        >
                            {map.name}
                        </h2>
                    )}

                    {showDesc && map.desc && (
                        <p
                            className={`line-clamp-2 text-sm transition-colors duration-200 ${
                                selected
                                    ? "text-slate-400"
                                    : "text-slate-600"
                            }`}
                        >
                            {map.desc}
                        </p>
                    )}
                </div>

                <GameButton
                    variant="secondary"
                    onPress={nextMap}
                    className="h-7"
                    aria-label="Next map"
                >
                    ▶
                </GameButton>
            </div>
        </div>
    );
}
