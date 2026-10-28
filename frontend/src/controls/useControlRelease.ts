import { useEffect } from "react";
import { useUIStore } from "../store/uiStore";
import { useCanDataStore } from "../store/canDataStore";
import { useNetworkStore } from "../store/networkStore";
import { usePerformanceOverlayStore } from "../performance/performanceOverlayStore";
import { canDrive } from "../store/tools/inputRouting";

export function useControlRelease(release: () => void) {
  useEffect(() => {
    const blocked = () => { if (!canDrive()) release(); };
    const hidden = () => { if (document.visibilityState === "hidden") release(); };
    const ui = useUIStore.subscribe(blocked), can = useCanDataStore.subscribe(blocked), inspector = usePerformanceOverlayStore.subscribe(blocked);
    const network = useNetworkStore.subscribe((state, previous) => { if (previous.connected && !state.connected) release(); });
    window.addEventListener("blur", release); document.addEventListener("visibilitychange", hidden);
    return () => { ui(); can(); inspector(); network(); window.removeEventListener("blur", release); document.removeEventListener("visibilitychange", hidden); release(); };
  }, [release]);
}
