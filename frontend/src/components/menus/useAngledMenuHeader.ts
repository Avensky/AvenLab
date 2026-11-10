import { isMobileBrowser } from "../../controls/inputDevice";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";

export function useAngledMenuHeader() {
  const style = usePreferencesStore((state) => state.menuHeaderStyle);
  return isMobileBrowser() || style === "angled";
}
