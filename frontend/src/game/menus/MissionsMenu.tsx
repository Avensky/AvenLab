import { TabbedMenu } from "../../components/menus/TabbedMenu";
import { useUIStore } from "../../store/menus/uiStore";

export function MissionsMenu() {
  const back = useUIStore((s) => s.backToParentMenu);
  const inGame = useUIStore((s) => s.overlay !== null);
  return (
    <TabbedMenu
      title="Mission board"
      subtitle="Win the objective. Bring enough to get home."
      onBack={back}
      tabs={[
        {
          id: "overview",
          label: "Overview",
          description:
            "Capture the flag is playable in Quickplay. The Missions HUD reports confirmed flag pickup, drop, return and capture events.",
          rows: [
            {
              id: "sandbox",
              label: inGame ? "Return to sandbox" : "Open sandbox garage",
              description:
                "Explore the streamed city and practice vehicle handling.",
              value: "Available",
              adjustable: false,
              action: () => {
                const ui = useUIStore.getState();
                if (inGame) ui.closeOverlay();
                else ui.setScreen("sandbox_setup");
              },
            },
            {
              id: "ctf",
              label: "Capture the flag",
              description:
                "Two squads. Vehicle roles. Objective play with limited supplies.",
              value: "Quickplay",
              disabled: true,
            },
          ],
        },
        {
          id: "objectives",
          label: "Objectives",
          description:
            "CTF rules: first team to three captures wins, with a 15-minute match limit. At the limit, higher score wins; a tied score goes to the team that captured last. A 0–0 match is a draw. All scoring is enforced by the match server. Your own flag must be home before you can turn in the enemy flag.",
          rows: [
            {
              id: "capture",
              label: "Capture",
              description:
                "Touch the enemy flag, secure it and bring it to your own home-base ring. Your flag must be home to score.",
              disabled: true,
            },
            {
              id: "escort",
              label: "Escort & defend",
              description:
                "Protect your carrier, guard routes and coordinate the return.",
              disabled: true,
            },
            {
              id: "recover",
              label: "Recover",
              description:
                "Physically touch your dropped flag to return it, then regroup before the next push.",
              disabled: true,
            },
          ],
        },
        {
          id: "logistics",
          label: "Logistics",
          description:
            "Planned resource systems will make route choice and reserve capacity part of the match. The menu does not simulate fuel use or overheating.",
          rows: [
            {
              id: "fuel",
              label: "Fuel & range",
              description:
                "Plan the objective, detours and a return reserve. Refuel at gas stations. Consumption must account for engine load, speed and vehicle efficiency.",
              value: "Planned",
              disabled: true,
            },
            {
              id: "momentum",
              label: "Momentum & braking",
              description:
                "Smooth driving saves energy. Braking dissipates kinetic energy; accelerating again consumes fuel. Safe speed depends on route and conditions.",
              value: "Planned",
              disabled: true,
            },
            {
              id: "temperature",
              label: "Heat & cooling",
              description:
                "Sustained load and boost build heat. Airflow, cooling equipment and recovery time affect safe operation.",
              value: "Planned",
              disabled: true,
            },
            {
              id: "supplies",
              label: "Supplies & support",
              description:
                "Balance fuel, repair supplies, cooling and cargo against mobility. Support vehicles keep a push supplied.",
              value: "Planned",
              disabled: true,
            },
          ],
        },
        {
          id: "squad",
          label: "Squad roles",
          description:
            "These roles are mission-planning concepts. Party, ready checks and matchmaking are not connected yet.",
          rows: [
            {
              id: "runner",
              label: "Runner / recon",
              description:
                "Scout efficient routes and move the flag. Preserve range for the return.",
              disabled: true,
            },
            {
              id: "escort",
              label: "Escort / defender",
              description:
                "Protect the carrier, control intersections and keep an exit route open.",
              disabled: true,
            },
            {
              id: "support",
              label: "Support / logistics",
              description:
                "Stage fuel and repairs, choose rendezvous points and plan the next push.",
              disabled: true,
            },
          ],
        },
      ]}
    />
  );
}
