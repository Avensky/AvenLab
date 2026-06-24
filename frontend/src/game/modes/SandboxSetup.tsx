import { useSelectionStore, useUIStore } from "../../store";
import { GameButton } from "../../components/GameButton";
import { socket } from "../../net/rustSocket";

export function SandboxSetup() {
  const setScreen = useUIStore((s) => s.setScreen);

  const vehicle = useSelectionStore((s) => s.getSelectedVehicle());
  const map = useSelectionStore((s) => s.getSelectedMap());
  const selectedIndex = useUIStore((s) => s.selectedMenuIndexById.sandbox_setup);
  const setActiveMenuIndex = useUIStore((s) => s.setActiveMenuIndex);

  const nextVehicle = useSelectionStore((s) => s.nextVehicle);
  const prevVehicle = useSelectionStore((s) => s.prevVehicle);
  const nextMap = useSelectionStore((s) => s.nextMap);
  const prevMap = useSelectionStore((s) => s.prevMap);

  const startSandbox = () => {
    socket?.send?.(
      JSON.stringify({
        type: "spawn_request",
        vehicle: vehicle.id,
        map: map.id,
        mode: "sandbox",
      })
    );

    setScreen("sandbox");
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col w-screen text-cyan-100">
      {/* Header */}
      <div className="absolute top-2 rounded-2xl border border-cyan-400/30 bg-slate-950/90 p-4 shadow-2xl shadow-cyan-500/20 left-1/2 z-20 w-[min(94vw,900px)] -translate-x-1/2">
        <p className="text-xs uppercase tracking-[0.4em] text-yellow-300">
          SANDBOX DEPLOYMENT
        </p>

        <p className="text-4xl font-black text-cyan-100">
          Select Loadout
        </p>
      </div>

      {/* Selection Components */}
      <div className="absolute bottom-2 left-1/2 z-20 w-[min(94vw,900px)] -translate-x-1/2">
        
        {/* Vehicle */}
        <div className={`px-4 mb-1 rounded-2xl border  ${
          selectedIndex === 0
            ? "border-yellow-300/80 bg-yellow-400/10"
            : "border-cyan-400/20 bg-slate-950/45"
          }`}
          onPointerEnter={() => setActiveMenuIndex(0)}
        >
          <p className="text-xs uppercase text-slate-500">
            Vehicle
          </p>

          <div className="flex items-center justify-between gap-3">
            <GameButton variant="secondary" onPress={prevVehicle}>
              ◀
            </GameButton>

            <div className="min-w-0 flex-1 text-center">
              <h2 className="truncate text-2xl font-black text-cyan-100">
                {vehicle.name}
              </h2>

              <p className="text-sm uppercase text-yellow-300">
                Role: {vehicle.role}
              </p>
            </div>

            <GameButton variant="secondary" onPress={nextVehicle}>
              ▶
            </GameButton>
          </div>
        </div>

        {/* Map */}
        <div  className={`px-4 mb-1 rounded-2xl border ${
          selectedIndex === 1
            ? "border-yellow-300/80 bg-yellow-400/10"
            : "border-cyan-400/20 bg-slate-950/45"
          }`}
          onPointerEnter={() => setActiveMenuIndex(1)}
        >
          <p className="text-xs uppercase text-slate-500">
            Map
          </p>

          <div className="flex items-center justify-between gap-3">
            <GameButton variant="secondary" onPress={prevMap}>
              ◀
            </GameButton>

            <div className="min-w-0 flex-1 text-center">
              <h2 className="truncate text-2xl font-black text-cyan-100">
                {map.name}
              </h2>

              <p className="line-clamp-2 text-sm text-slate-400">
                {map.desc}
              </p>
            </div>

            <GameButton variant="secondary" onPress={nextMap}>
              ▶
            </GameButton>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3">
          <GameButton
            selected={selectedIndex === 2}
            onFocus={() => setActiveMenuIndex(2)}
            onPress={startSandbox}
          >
            START SANDBOX
          </GameButton>

          <GameButton
            selected={selectedIndex === 3}
            variant="danger"
            onFocus={() => setActiveMenuIndex(3)}
            onPress={() => setScreen("main")}
          >
            BACK
          </GameButton>
        </div>
      </div>
    </div>
  );
}