import { useSelectionStore, useUIStore } from "../../store";
import { GameButton } from "../../components/GameButton";

type VehicleSelectorProps = {
    menuIndex?: number;
    menuId?: "sandbox_setup" | "signal_recon_setup";
    showName?: boolean;
    showRole?: boolean;
    showCanSlug?: boolean;
    showNotes?: boolean;
};

export function VehicleSelector({
    menuIndex = 0,
    menuId = "signal_recon_setup",
    showName = true,
    showRole = true,
    showCanSlug = true,
    showNotes = true,
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
            <p className="text-xs uppercase text-slate-500">
                Vehicle
            </p>

            <div className="flex items-center justify-between gap-3">
                <GameButton
                    variant="secondary"
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
                                selected
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
                                selected
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
                                selected
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
                                selected
                                    ? "text-slate-400"
                                    : "text-slate-600"
                            }`}
                        >
                            {vehicle.canIdentity.notes}
                        </p>
                    )}
                </div>

                <GameButton
                    variant="secondary"
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
