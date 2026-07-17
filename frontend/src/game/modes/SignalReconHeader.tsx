import { GameButton } from "../../components/GameButton";
import { useUIStore } from "../../store";
import {
    useCanBusStore,
    type CanInterface,
    type CanMode,
} from "../../store/canBusStore";
import { useMemo } from "react";


type SignalReconHeaderProps = {
  title?: string;
  subtitle?: string;
  status?: string;
};

const SignalReconHeader: React.FC<SignalReconHeaderProps> = () => {
    
    const CAN_INTERFACE_OPTIONS: CanInterface[] = ["can0", "can1", "can2", "vcan0"];
    const CAN_MODE_OPTIONS: CanMode[] = ["listen-only", "simulation", "live"];
    const setSelectedInterface = useCanBusStore((s) => s.setSelectedInterface);
    const setSelectedMode = useCanBusStore((s) => s.setSelectedMode);
    const setScreen = useUIStore((s) => s.setScreen);

    const selectedIndex = useUIStore((s) => s.selectedMenuIndexById.signal_recon_setup);
    const setActiveMenuIndex = useUIStore((s) => s.setActiveMenuIndex);
    
    const canStatus = useCanBusStore((s) => s.status);
    const selectedInterface = useCanBusStore((s) => s.selectedInterface);
    const selectedMode = useCanBusStore((s) => s.selectedMode);
    const availableInterfaces = useMemo(() => {
        if (!canStatus) return CAN_INTERFACE_OPTIONS;

        const available = CAN_INTERFACE_OPTIONS.filter((iface) => {
            const interfaceStatus = canStatus[iface];
            return interfaceStatus?.exists || iface === selectedInterface;
        });

        return available.length ? available : CAN_INTERFACE_OPTIONS;
    }, [canStatus, selectedInterface]);


    return(
              <div className="absolute top-0 flex justify-between items-start p-2 border-b border-cyan-400/30 bg-slate-950/90 shadow-2xl shadow-cyan-500/20 left-1/2 z-20 w-full -translate-x-1/2">
                  <div>
                      <p className="text-xs uppercase tracking-[0.4em] text-yellow-300">
                          SIGNAL RECON
                      </p>
  
                      <p className="text-4xl font-black text-cyan-100">
                          Select Vehicle
                      </p>
                  </div>
  
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs text-slate-400 sm:flex sm:items-end sm:justify-end">
                      <label className="">
                          <span className="text-[10px] tracking-[0.24em] text-slate-500">
                              IFACE: 
                          </span>
                          <select
                              value={selectedInterface}
                              // disabled={canControlsDisabled}
                              onChange={(event) =>
                                  setSelectedInterface(event.target.value as CanInterface)
                              }
                              className="w-full rounded-lg border border-green-400/30 bg-slate-950 px-3 py-2 sm:px-2 sm:py-1 font-mono text-xs font-bold text-green-100 outline-none transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40 sm:w-36"
                          >
                              {availableInterfaces.map((iface) => {
                                  const interfaceStatus = canStatus?.[iface];
                                  const label =
                                      interfaceStatus?.up === false ? `${iface} · DOWN` : iface;
  
                                  return (
                                      <option key={iface} value={iface}>
                                          {label}
                                      </option>
                                  );
                              })}
                          </select>
                      </label>
  
                      <label className="">
                          <span className="text-[10px] tracking-[0.24em] text-slate-500">
                              MODE:
                          </span>
                          <select
                              value={selectedMode}
                              // disabled={canControlsDisabled}
                              onChange={(event) =>
                                  setSelectedMode(event.target.value as CanMode)
                              }
                              className="w-full rounded-lg border border-green-400/30 bg-slate-950 px-3 py-2 sm:px-2 sm:py-1 font-mono text-xs font-bold text-green-100 outline-none transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40 sm:w-40"
                          >
                              {CAN_MODE_OPTIONS.map((mode) => (
                                  <option key={mode} value={mode}>
                                      {mode.toUpperCase()}
                                  </option>
                              ))}
                          </select>
                      </label>
                      <GameButton
                          selected={selectedIndex === 3}
                          variant="danger"
                          onFocus={() => setActiveMenuIndex(3)}
                          onPress={() => setScreen("main")}
                          className="rounded-lg text-center"
                      >
                          EXIT
                      </GameButton>
                  </div>
              </div>
  
);}

export default SignalReconHeader;
