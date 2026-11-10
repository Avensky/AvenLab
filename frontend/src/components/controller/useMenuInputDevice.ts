import { resolveMenuInputDevice } from "../../controls/inputDevice";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";

export function useMenuInputDevice() {
  return usePreferencesStore((state) => resolveMenuInputDevice(state.inputDevice));
}
