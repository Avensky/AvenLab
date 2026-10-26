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
            className={`border-t px-4 pb-1 transition-[background,border-color,box-shadow] duration-200 ${background}`}
            onPointerEnter={() => setActiveMenuIndex(menuIndex)}
            onFocusCapture={() => setActiveMenuIndex(menuIndex)}
        >
            <p className="text-xs uppercase text-slate-500">
                Vehicle
            </p>

            <div className="flex items-center justify-between gap-3">
                <GameButton
                    variant={translucent ? "neutral" : menuId === "sandbox_setup" ? "selector" : "secondary"}
                    onPress={previousVehicle}
                    className="h-7"
                    aria-label="Previous vehicle"
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
                            {vehicle.name}
                        </h2>
                    )}

                    {showRole && vehicle.role && (
                        <p
                            className={`text-sm uppercase transition-colors duration-200 ${
                                selected || translucent
                                    ? "text-yellow-300"
                                    : "text-yellow-300/40"
                            }`}
                        >
                            Role: {vehicle.role}
                        </p>
                    )}

                    {showCanSlug && vehicle.canIdentity?.slug && (
                        <p
                            className={`truncate font-mono text-xs transition-colors duration-200 ${
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
                            className={`truncate text-[11px] transition-colors duration-200 ${
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
                    className="h-7"
                    aria-label="Next vehicle"
                >
                    ▶
                </GameButton>
            </div>
        </div>
    );
}
