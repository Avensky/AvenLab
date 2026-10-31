import { useRef, useState } from "react";
import { useSocialStore } from "../../store/social/socialStore";
import { requestSocial } from "../../net/socialClient";
import { ProgressBadge } from "../alpha/ProgressBadge";
import { TabbedMenu, type MenuRow } from "../../components/menus/TabbedMenu";
import { vehicleCatalog } from "../../store/selection/selectionStore";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { useUIStore } from "../../store/menus/uiStore";

const planned = (id: string, label: string, description: string): MenuRow => ({
  id,
  label,
  description,
  value: "Not tracked yet",
  disabled: true,
});
export function CareerMenu() {
  const view = useSocialStore((s) => s.view),
    p = view?.profile.progression;
  const [status, setStatus] = useState("");
  const pending = useRef(false);
  const skinAction = async (action: string, skin: string) => {
    if (pending.current) return;
    pending.current = true;
    try {
      await requestSocial(action, { skin });
      setStatus(
        action === "skin_redeem"
          ? "Skin voucher redeemed"
          : "Skin selection saved",
      );
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      pending.current = false;
    }
  };
  const back = useUIStore((s) => s.backToParentMenu);
  const favorites = usePreferencesStore((s) => s.favoriteVehicles);
  const toggleFavorite = usePreferencesStore((s) => s.toggleFavorite);
  return (
    <TabbedMenu
      title="Career"
      subtitle="Win tiers and prestige levels are separate. Alpha cosmetics use milestone credits."
      status={status}
      onBack={back}
      tabs={[
        {
          id: "statistics",
          label: "Statistics",
          description:
            "Competitive wins advance the tier ladder. Levels run 1–100, then restart at prestige with a new color and higher XP costs. Rewards require verified match results; test worlds grant none.",
          content: <ProgressBadge />,
          rows: [
            {
              id: "tier",
              label: "Competitive tier",
              value: p
                ? `${p.tier} · ${p.competitive_wins} WINS`
                : "CONNECT TO SERVER",
            },
            {
              id: "level",
              label: "Driver level / prestige",
              value: p ? `LV ${p.level}/100 · PRESTIGE ${p.prestige}` : "—",
            },
            {
              id: "xp",
              label: "Next level",
              value: p ? `${p.xp} / ${p.required_xp} XP` : "—",
            },
            {
              id: "wins",
              label: "Quickplay wins",
              value: p ? String(p.quickplay_wins) : "—",
            },
            {
              id: "credits",
              label: "Milestone credits",
              value: p
                ? `${p.credits} · NEXT MILESTONE LV ${p.next_milestone}`
                : "—",
            },
          ],
        },
        {
          id: "history",
          label: "History",
          description:
            "No match history is recorded in this build. Completed matches will appear here with team results, objectives and resource use.",
          rows: [],
        },
        {
          id: "leaderboard",
          label: "Leaderboard",
          description:
            "Rankings are unavailable until the competitive match service is connected. No sample players or invented ranks are shown.",
          rows: [],
        },
        {
          id: "favorites",
          label: "Favorites",
          description:
            "Mark vehicles for quick reference. Favorites do not change the active vehicle or its physics.",
          rows: vehicleCatalog.map((vehicle) => ({
            id: vehicle.id,
            label: vehicle.name,
            description: `${vehicle.role.toUpperCase()} · ${vehicle.description}`,
            value: favorites.includes(vehicle.id)
              ? "★ Favorite"
              : "☆ Add favorite",
            action: () => toggleFavorite(vehicle.id),
          })),
        },
        {
          id: "customize",
          label: "Customize",
          description:
            "Redeem milestone credits for alpha skin vouchers. Ownership and the chosen voucher are saved on the server; vehicle paint/skin assets will use these IDs in the cosmetics update.",
          rows: (view?.alpha?.skins ?? []).map((skin) => ({
            id: skin.id,
            label: skin.name,
            description: p?.owned.includes(skin.id)
              ? "Owned voucher · choose for your future loadout"
              : `${skin.cost} milestone credits`,
            value:
              p?.equipped === skin.id
                ? "SELECTED"
                : p?.owned.includes(skin.id)
                  ? "CHOOSE"
                  : `${skin.cost} CREDITS`,
            disabled:
              !p ||
              p.equipped === skin.id ||
              (!p.owned.includes(skin.id) && p.credits < skin.cost),
            action: () =>
              void skinAction(
                p?.owned.includes(skin.id) ? "skin_equip" : "skin_redeem",
                skin.id,
              ),
          })),
        },
        {
          id: "achievements",
          label: "Achievements",
          description:
            "Achievement ideas below are untracked goals. They are not earned or claimable rewards.",
          rows: [
            planned(
              "capture",
              "First capture",
              "Return an enemy flag to your base.",
            ),
            planned(
              "supply",
              "Supply line",
              "Complete a team resupply during a match.",
            ),
            planned(
              "economy",
              "Efficient operator",
              "Finish an objective with fuel in reserve.",
            ),
            planned(
              "heat",
              "Keep your cool",
              "Complete a mission without overheating.",
            ),
          ],
        },
      ]}
    />
  );
}
