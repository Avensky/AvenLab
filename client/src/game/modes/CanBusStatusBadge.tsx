import { useEffect } from "react";
import { useCanBusStore } from "../../store/canBusStore";

export function CanBusStatusBadge() {
    const status = useCanBusStore((s) => s.status);
    const refreshStatus = useCanBusStore((s) => s.refreshStatus);

    useEffect(() => {
        refreshStatus();
        const id = window.setInterval(refreshStatus, 2000);
        return () => window.clearInterval(id);
    }, [refreshStatus]);

    const mode = status?.mode ?? "offline";

    const styles = {
        live: "border-red-300/50 bg-red-500/15 text-red-100",
        simulation: "border-cyan-300/50 bg-cyan-500/15 text-cyan-100",
        offline: "border-slate-600 bg-slate-900 text-slate-400",
    } as const;

    return (
        <div className={`rounded-xl border px-4 py-3 font-mono text-xs ${styles[mode]}`
        }>
            <div className="font-bold uppercase" >
                CAN BUS: {mode}
            </div>
            <div>
                interface: {status?.active ?? "none"}
            </div>
        </div>
    );
}