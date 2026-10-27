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
            className={`selection-strip border-t transition-[background,border-color,box-shadow] duration-200 ${getSelectionClasses(selected, translucent)}`}
            onPointerEnter={() => setActiveMenuIndex(menuIndex)}
            onFocusCapture={() => setActiveMenuIndex(menuIndex)}
        >
            <div className="selection-strip-layout">
                <GameButton
                    variant={translucent ? "neutral" : menuId === "sandbox_setup" ? "selector" : "secondary"}
                    onPress={previousMap}
                    className="selection-strip-arrow"
                    aria-label="Previous map"
                >
                    ◀
                </GameButton>

                <div className="min-w-0 flex-1 text-center">
                    <p className="selection-strip-label text-slate-400">ENVIRONMENT</p>
                    {showName && (
                        <h2
                            className={`selection-strip-title truncate font-black transition-colors duration-200 ${
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
                            className={`selection-strip-meta truncate transition-colors duration-200 ${
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
                    className="selection-strip-arrow"
                    aria-label="Next map"
                >
                    ▶
                </GameButton>
            </div>
        </div>
    );
}
