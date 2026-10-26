import { GameButton } from "../../components/GameButton";
import { getSelectionClasses } from "../../components/menus/selectionStyles";
import { useSelectionStore, useUIStore } from "../../store";

type MapSelectorProps = {
    menuIndex?: number;
    menuId?: "sandbox_setup" | "signal_recon_setup";
    showName?: boolean;
    showDesc?: boolean;
    translucent?: boolean;
};

export function MapSelector({
    menuIndex = 1,
    menuId = "signal_recon_setup",
    showName = true,
    showDesc = true,
    translucent = false,
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
            className={`border-t px-4 pb-1 transition-[background,border-color,box-shadow] duration-200 ${getSelectionClasses(selected, translucent)}`}
            onPointerEnter={() => setActiveMenuIndex(menuIndex)}
            onFocusCapture={() => setActiveMenuIndex(menuIndex)}
        >
            <p
                className={`text-xs uppercase transition-colors duration-200 ${
                    selected || translucent
                        ? "text-slate-400"
                        : "text-slate-600"
                }`}
            >
                Map
            </p>

            <div className="flex items-center justify-between gap-3">
                <GameButton
                    variant={translucent ? "neutral" : menuId === "sandbox_setup" ? "selector" : "secondary"}
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
                                selected || translucent
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
                                selected || translucent
                                    ? "text-slate-400"
                                    : "text-slate-600"
                            }`}
                        >
                            {map.desc}
                        </p>
                    )}
                </div>

                <GameButton
                    variant={translucent ? "neutral" : menuId === "sandbox_setup" ? "selector" : "secondary"}
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
