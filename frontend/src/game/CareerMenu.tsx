import { TabbedMenu, type MenuRow } from "../components/menus/TabbedMenu";
import { vehicleCatalog } from "../store/selectionStore";
import { usePreferencesStore } from "../store/preferencesStore";
import { useUIStore } from "../store/uiStore";

const planned = (id: string, label: string, description: string): MenuRow => ({ id, label, description, value: "Not tracked yet", disabled: true });
export function CareerMenu() {
  const back = useUIStore((s) => s.backToParentMenu);
  const favorites = usePreferencesStore((s) => s.favoriteVehicles);
  const toggleFavorite = usePreferencesStore((s) => s.toggleFavorite);
  return <TabbedMenu title="Career" subtitle="Your driver record and vehicle collection. Favorites are saved on this device." onBack={back} tabs={[
    { id: "statistics", label: "Statistics", description: "Career tracking has not been connected. This page will show your actual match and driving data when it is available.", rows: [
      planned("matches", "Matches & win rate", "Wins, losses, captures and team contribution."), planned("driving", "Driving record", "Distance, fuel economy, time driving and vehicle usage."),
      planned("logistics", "Logistics record", "Resupplies, heat management and successful returns to base."),
    ] },
    { id: "history", label: "History", description: "No match history is recorded in this build. Completed matches will appear here with team results, objectives and resource use.", rows: [] },
    { id: "leaderboard", label: "Leaderboard", description: "Rankings are unavailable until the competitive match service is connected. No sample players or invented ranks are shown.", rows: [] },
    { id: "favorites", label: "Favorites", description: "Mark vehicles for quick reference. Favorites do not change the active vehicle or its physics.", rows: vehicleCatalog.map((vehicle) => ({
      id: vehicle.id, label: vehicle.name, description: `${vehicle.role.toUpperCase()} · ${vehicle.description}`, value: favorites.includes(vehicle.id) ? "★ Favorite" : "☆ Add favorite", action: () => toggleFavorite(vehicle.id),
    })) },
    { id: "customize", label: "Customize", description: "Vehicles will fill the hero roles in your squad. Cosmetic and upgrade systems are planned; nothing can be purchased or equipped in this build.", rows: [
      { id: "heroes", label: "Vehicle / hero loadouts", description: "Roles, paint, cosmetics and saved equipment.", value: "Planned", disabled: true },
      { id: "upgrades", label: "Upgrades & inventory", description: "Cooling, range, traction and cargo tradeoffs for each mission.", value: "Planned", disabled: true },
      { id: "wallet", label: "Loot & currency", description: "Server-validated rewards, ownership and upgrade costs.", value: "Planned", disabled: true },
    ] },
    { id: "achievements", label: "Achievements", description: "Achievement ideas below are untracked goals. They are not earned or claimable rewards.", rows: [
      planned("capture", "First capture", "Return an enemy flag to your base."), planned("supply", "Supply line", "Complete a team resupply during a match."),
      planned("economy", "Efficient operator", "Finish an objective with fuel in reserve."), planned("heat", "Keep your cool", "Complete a mission without overheating."),
    ] },
  ]} />;
}
