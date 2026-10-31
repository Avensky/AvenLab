import { lazy, Suspense } from "react";
import { useSocialStore } from "../../store/social/socialStore";
import { ControllerButton } from "../../components/controller";
import { useEffect, useId, useRef, useState } from "react";
import { trapMenuFocus } from "../../components/menus/menuFocus";
import { requestVehicleChange } from "../../net/rustSocket";
import { useNetworkStore } from "../../store/session/networkStore";
import {
  useSelectionStore,
  vehicleCatalog,
} from "../../store/selection/selectionStore";
import { useUIStore } from "../../store/menus/uiStore";
import type { MenuAction } from "../../controls/inputRouting";

const AlphaHeroPicker = lazy(() =>
  import("../alpha/HeroSelection").then((module) => ({
    default: module.HeroSelection,
  })),
);
export function VehicleMenu() {
  const active = useSocialStore((state) => state.view?.alpha?.active);
  return active ? (
    <Suspense fallback={<div role="status">Opening hero selection…</div>}>
      <AlphaHeroPicker overlay />
    </Suspense>
  ) : (
    <LegacyVehicleMenu />
  );
}
function LegacyVehicleMenu() {
  const current = useNetworkStore((s) => s.getMe()?.vehicle_id ?? "");
  const [selected, setSelected] = useState(() =>
    Math.max(
      0,
      vehicleCatalog.findIndex((vehicle) => vehicle.id === current),
    ),
  );
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  const back = useUIStore((s) => s.backToParentMenu);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!pending) buttons.current[selected]?.focus({ preventScroll: true });
  }, [selected, pending]);

  const choose = async (index: number) => {
    if (inFlight.current) return;
    const vehicle = vehicleCatalog[index];
    if (vehicle.id === current) {
      useSelectionStore.setState({ vehicleIndex: index });
      useUIStore.getState().closeOverlay();
      return;
    }
    if (!useNetworkStore.getState().connected) {
      setError("Connect to the game server before changing vehicles.");
      return;
    }
    inFlight.current = true;
    setPending(vehicle.id);
    setError("");
    try {
      await requestVehicleChange(vehicle.id);
      if (!mounted.current) return;
      useSelectionStore.setState({ vehicleIndex: index });
      useUIStore.getState().closeOverlay();
    } catch (reason) {
      if (mounted.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to change vehicles.",
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(null);
    }
  };

  useEffect(() => {
    const handle = (event: Event) => {
      const action = (event as CustomEvent<MenuAction>).detail;
      if (action === "back") {
        back();
        return;
      }
      if (pending) return;
      if (action === "left" || action === "up")
        setSelected(
          (value) =>
            (value + vehicleCatalog.length - 1) % vehicleCatalog.length,
        );
      else if (action === "right" || action === "down")
        setSelected((value) => (value + 1) % vehicleCatalog.length);
      else if (action === "activate") void choose(selected);
    };
    window.addEventListener("avenlab:panel-action", handle);
    return () => window.removeEventListener("avenlab:panel-action", handle);
  });

  return (
    <div className="game-ui menu-surface menu-confirm-overlay fixed inset-0 z-50">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onKeyDown={trapMenuFocus}
        className="menu-vehicle-card"
      >
        <header className="tabbed-menu-header">
          <h1 id={`${id}-title`} className="menu-heading-title">
            CHANGE VEHICLE
          </h1>
          <button
            type="button"
            className="menu-control menu-back"
            onClick={back}
            onKeyDown={(event) => {
              if (event.code === "Enter" || event.code === "Space") {
                event.preventDefault();
                event.stopPropagation();
                if (!event.repeat) back();
              }
            }}
          >
            <ControllerButton button="B" />
            BACK
          </button>
        </header>
        <div className="menu-vehicle-list">
          {vehicleCatalog.map((vehicle, index) => (
            <button
              type="button"
              key={vehicle.id}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              data-menu-row={`vehicle-${vehicle.id}`}
              disabled={Boolean(pending)}
              data-selected={selected === index}
              className="menu-control menu-row"
              onFocus={() => setSelected(index)}
              onPointerEnter={() => setSelected(index)}
              onClick={() => void choose(index)}
              onKeyDown={(event) => {
                if (event.code === "Enter" || event.code === "Space") {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!event.repeat) void choose(index);
                }
              }}
            >
              <span>{vehicle.name}</span>
              {current === vehicle.id && (
                <span className="menu-control-note">CURRENT</span>
              )}
            </button>
          ))}
        </div>
        {pending && (
          <p role="status" className="menu-vehicle-notice">
            CHANGING VEHICLE…
          </p>
        )}
        {error && (
          <p role="alert" className="menu-vehicle-notice">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
