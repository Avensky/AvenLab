import { useSelectionStore, useUIStore } from "../../store";
import { GameButton } from "../../components/GameButton";
import { getSelectionClasses } from "../../components/menus/selectionStyles";

type VehicleSelectorProps = {
    menuIndex?: number;
    menuId?: "sandbox_setup" | "signal_recon_setup";
    showName?: boolean;
    showRole?: boolean;
    showCanSlug?: boolean;
    showNotes?: boolean;
    translucent?: boolean;
};

export function VehicleSelector({
    menuIndex = 0,
    menuId = "signal_recon_setup",
    showName = true,
    showRole = true,
    showCanSlug = true,
    showNotes = true,
    translucent = false,
}: VehicleSelectorProps) {
    const vehicle = useSelectionStore((s) => s.getSelectedVehicle());
    const previousVehicle = useSelectionStore((s) => s.prevVehicle);
    const nextVehicle = useSelectionStore((s) => s.nextVehicle);

    const selectedIndex = useUIStore(
        (s) => s.selectedMenuIndexById[menuId]
    );
    const setActiveMenuIndex = useUIStore(
        (s) => s.setActiveMenuIndex
    );

    const selected = selectedIndex === menuIndex;
    const background = getSelectionClasses(selected, translucent);

    return (
        <div
            className={`selection-strip border-t transition-[background,border-color,box-shadow] duration-200 ${background}`}
            onPointerEnter={() => setActiveMenuIndex(menuIndex)}
            onFocusCapture={() => setActiveMenuIndex(menuIndex)}
        >
            <div className="selection-strip-layout">
                <GameButton
                    variant={translucent ? "neutral" : menuId === "sandbox_setup" ? "selector" : "secondary"}
                    onPress={previousVehicle}
                    className="selection-strip-arrow"
                    aria-label="Previous vehicle"
                >
                    ◀
                </GameButton>

                <div className="min-w-0 flex-1 text-center">
                    <p className="selection-strip-label text-slate-400">VEHICLE</p>
                    <div className="selection-strip-heading">
                    {showName && (
                        <h2
                            className={`selection-strip-title truncate font-black transition-colors duration-200 ${
                                selected || translucent
                                    ? "text-cyan-100"
                                    : "text-slate-500"
                            }`}
                        >
                            {vehicle.name}
                        </h2>
                    )}

                    {showRole && vehicle.role && (
                        <p
                            className={`selection-strip-role uppercase transition-colors duration-200 ${
                                selected || translucent
                                    ? "text-yellow-300"
                                    : "text-yellow-300/40"
                            }`}
                        >
                            {vehicle.role}
                        </p>
                    )}
                    </div>

                    {showCanSlug && vehicle.canIdentity?.slug && (
                        <p
                            className={`selection-strip-meta truncate font-mono transition-colors duration-200 ${
                                selected || translucent
                                    ? "text-cyan-300"
                                    : "text-cyan-300/35"
                            }`}
                        >
                            CAN: {vehicle.canIdentity.slug}
                        </p>
                    )}

                    {showNotes && vehicle.canIdentity?.notes && (
                        <p
                            className={`selection-strip-note truncate transition-colors duration-200 ${
                                selected || translucent
                                    ? "text-slate-400"
                                    : "text-slate-600"
                            }`}
                        >
                            {vehicle.canIdentity.notes}
                        </p>
                    )}
                </div>

                <GameButton
                    variant={translucent ? "neutral" : menuId === "sandbox_setup" ? "selector" : "secondary"}
                    onPress={nextVehicle}
                    className="selection-strip-arrow"
                    aria-label="Next vehicle"
                >
                    ▶
                </GameButton>
            </div>
        </div>
    );
}
