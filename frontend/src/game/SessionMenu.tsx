import { TabbedMenu } from "../components/menus/TabbedMenu";
import { connectRustServer, disconnectRustServer } from "../net/rustSocket";
import { useUIStore } from "../store/uiStore";

export function SessionMenu({ changeVehicle = false }: { changeVehicle?: boolean }) {
  const back = useUIStore((s) => s.backToParentMenu);
  const leave = () => {
    // Closing the socket invokes the server's existing physics/entity cleanup.
    // A new connection is required before spawning a different vehicle.
    disconnectRustServer();
    useUIStore.getState().setScreen(changeVehicle ? "sandbox_setup" : "main");
    connectRustServer();
  };
  return <TabbedMenu title={changeVehicle ? "Change vehicle" : "Leave game?"} onBack={back} backLabel="Cancel"
    subtitle={changeVehicle ? "Return to the garage and choose your next vehicle." : "Leave the current online session and return to the main menu."}
    tabs={[{ id: "confirm", label: "Confirm", description: "Your current vehicle will be removed from the world. A new sandbox run starts at the team spawn. This build has no saved run progress.", rows: [
      { id: "cancel", label: "Keep driving", action: () => useUIStore.getState().closeOverlay() },
      { id: "confirm", label: changeVehicle ? "Return to garage" : "Leave game", danger: true, action: leave },
    ] }]} />;
}
