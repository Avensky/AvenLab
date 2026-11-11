import {SurveyMap} from "../ui/Minimap/SurveyMap";
import {MinimapSessionLifecycle} from "../ui/Minimap/MinimapSessionLifecycle";
import {CtfMissionLifecycle} from "./stats/CtfMissionLifecycle";
import {MatchResultsScreen} from "./results/MatchResultsScreen";
import {CtfMatchHUD} from "./stats/CtfMatchHUD";
import {MatchScoreboard} from "./stats/MatchScoreboard";
import {TeamLineup} from "./stats/TeamLineup";
import {HeroAbilities} from "./heroes/HeroAbilities";
import {openHeroGuide} from "../store/hud/heroGuideStore";
import { CombatHUD } from "../combat/CombatHUD";
import { HeroWorkshop, HeroLoadoutSync } from "./heroes/HeroWorkshop";
import type { CharacterChoice } from "./characters/characterCatalog";
import type { CharacterTab } from "./characters/CharacterPage";
import { useAlphaFlow } from "./alpha/useAlphaFlow";
import { useAppTheme } from "../theme";
import "../theme/theme.css";
import { FullCanvas } from "../FullCanvas";
import { useUIStore } from "../store";
import { VehiclePreview } from "./preview";
import { MainMenu } from "./menus/MainMenu";
import { PauseMenu } from "./menus/PauseMenu";
import { ModeLoadingScreen } from "./ModeLoadingScreen";
import { Sandbox, SandboxSetup } from "./modes/sandbox/index";
import { DebugMenu } from "../components/debugger/DebugMenu";
import { DrivingHUD } from "../ui/DrivingHUD";
import { CockpitPanel } from "../ui/Cockpit/CockpitPanel";
import { CommandLine } from "../ui/command/CommandLine";
import { lazy, Suspense, useEffect, useState } from "react";
import { useSocialStore } from "../store/social/socialStore";
import { inviteCodeFromUrl } from "./social/invitationLinks";
import { SettingsMenu } from "./menus/SettingsMenu";
import { CareerMenu } from "./menus/CareerMenu";
import { MissionsMenu } from "./menus/MissionsMenu";
import { SessionMenu } from "./menus/SessionMenu";
import { VehicleMenu } from "./menus/VehicleMenu";
import { Cameras } from "../effects";
import { PerformanceOverlay } from "../performance/PerformanceOverlay";
import { useRenderSettingsStore } from "../store/presentation/renderSettingsStore";
import { HeroSelection } from "./alpha/HeroSelection";
import { ModeSelection } from "./alpha/ModeSelection";
import { useBuilderStore } from "../worldBuilder/state/builderStore";
import { QueueScreen } from "./alpha/QueueScreen";

const WorldBuilderPanel = lazy(() =>
  import("../worldBuilder/panels/WorldBuilderPanel").then((m) => ({
    default: m.WorldBuilderPanel,
  })),
);
const SocialPanel = lazy(() =>
  import("./social/SocialPanel").then((module) => ({
    default: module.SocialPanel,
  })),
);
const WorldBuilderScene = lazy(
  () => import("../worldBuilder/scene/WorldBuilderScene"),
);

const SignalRecon = lazy(() =>
  import("./modes/recon/SignalRecon").then((m) => ({ default: m.SignalRecon })),
);
const SignalReconSetup = lazy(() =>
  import("./modes/recon/SignalReconSetup").then((m) => ({
    default: m.SignalReconSetup,
  })),
);
const SignalReconMission = lazy(() =>
  import("./modes/recon/SignalReconMission").then((m) => ({
    default: m.SignalReconMission,
  })),
);

export function GameUI() {
  useAppTheme();
  useAlphaFlow();
  const workspace = useBuilderStore((s) => s.workspace);
  const hud = useRenderSettingsStore((s) => s.hud);
  const screen = useUIStore((s) => s.screen);
  const overlay = useUIStore((s) => s.overlay);
  const vehicleAuthoring = workspace === "vehicle" && overlay === "world_builder";
  const socialReady = useSocialStore((s) => Boolean(s.view));
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = inviteCodeFromUrl(url.href);
    if (!socialReady || !code) return;
    useSocialStore.setState({ entryCode: code });
    url.searchParams.delete("world_invite");
    window.history.replaceState(null, "", url);
    useUIStore.getState().setScreen("social");
  }, [socialReady]);
  const needsCanvas =
    screen === "sandbox" ||
    screen === "sandbox_setup" ||
    screen === "heroes" ||
    screen === "hero_select" ||
    screen === "mode_select" ||
    screen === "queue" ||
    screen === "signal_recon_setup" ||
    screen === "world_builder";
  const heroOwner = useSocialStore(s=>s.view?.profile.id??s.profileOwner??"guest");
  const [characterTab, setCharacterTab] = useState<CharacterTab | null>(null);
  const [characterDraft, setCharacterDraft] = useState<CharacterChoice | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [reconSidebarHidden, setReconSidebarHidden] = useState(false);
  const previewPaused = screen === "queue";

  return (
    <div className="relative game-wrapper" data-live-world={screen === "sandbox" || undefined}>
      <HeroLoadoutSync />
      <MinimapSessionLifecycle />
      <CtfMissionLifecycle />
      {screen === "heroes" && <HeroWorkshop key={heroOwner} onCharacterViewChange={setCharacterTab} onCharacterPreviewChange={setCharacterDraft} />}
      {/* Requires Canvas */}
      {needsCanvas && (
        <FullCanvas
          paused={previewPaused}
          preview={
            screen === "sandbox_setup" ||
            screen === "heroes" ||
            screen === "hero_select" ||
            screen === "mode_select" ||
            screen === "queue" ||
            screen === "signal_recon_setup"
          }
        >
          {(screen === "sandbox_setup" ||
            screen === "heroes" ||
            screen === "hero_select" ||
            screen === "mode_select" ||
            screen === "queue") && (
            <VehiclePreview
              heroLayout={screen !== "sandbox_setup"}
              awaitingHero={screen === "hero_select" || screen === "heroes"}
              characterDraft={screen === "heroes" ? characterDraft : null}
              wardrobeOpen={screen === "heroes" && characterTab !== null}
              characterOnly={screen === "heroes" && characterTab !== null && characterTab !== "emotes"}
              stationary={previewPaused}
            />
          )}
          {screen === "world_builder" && (
            <Suspense fallback={null}>
              <WorldBuilderScene />
            </Suspense>
          )}
          {screen === "sandbox" && (
            <>
              {(overlay !== "world_builder" || vehicleAuthoring) && <Sandbox />}
              {overlay === "world_builder" && !vehicleAuthoring && (
                <Suspense fallback={null}>
                  <WorldBuilderScene />
                </Suspense>
              )}
            </>
          )}

          {screen === "signal_recon_setup" && <VehiclePreview />}
          {screen === "sandbox" && (overlay !== "world_builder" || vehicleAuthoring) && <Cameras />}
        </FullCanvas>
      )}

      {/* UI Overlay */}
      {screen === "sandbox" && !overlay && hud && <DrivingHUD />}
      {screen === "sandbox" && <CombatHUD />}
      {screen === "sandbox" && !overlay && hud && <CtfMatchHUD />}

      {/* Research pages load only when opened; keep the canvas mounted. */}
      <Suspense
        fallback={
          <div role="status" className="menu-loading">
            Opening research tools…
          </div>
        }
      >
        {screen === "signal_recon" && (
          <SignalRecon
            collapsed={collapsed}
            setCollapsed={setCollapsed}
            sidebarHidden={reconSidebarHidden}
            setSidebarHidden={setReconSidebarHidden}
          />
        )}
        {screen === "signal_recon_mission" && (
          <SignalReconMission
            collapsed={collapsed}
            setCollapsed={setCollapsed}
          />
        )}
        {screen === "hero_select" && <HeroSelection />}
        {screen === "mode_select" && <ModeSelection />}
        {screen === "queue" && <QueueScreen />}
        {screen === "sandbox_setup" && (
          <SandboxSetup collapsed={collapsed} setCollapsed={setCollapsed} />
        )}
        {screen === "signal_recon_setup" && (
          <SignalReconSetup collapsed={collapsed} setCollapsed={setCollapsed} />
        )}
      </Suspense>
      <MatchScoreboard onAbilities={openHeroGuide} />
      {screen === "sandbox" && <TeamLineup />}
      {overlay === "hero_abilities" && <HeroAbilities />}
      {overlay === "match_results" && <MatchResultsScreen />}
      {/* Menus */}
      {screen === "main" && <MainMenu />}
      {screen === "sandbox" && overlay === "pause" && <PauseMenu />}
      {overlay === "debug_menu" && <DebugMenu />}
      {(overlay === "settings" || (screen === "settings" && !overlay)) && (
        <SettingsMenu />
      )}
      {(overlay === "career" || (screen === "career" && !overlay)) && (
        <CareerMenu />
      )}
      {(overlay === "missions" || (screen === "missions" && !overlay)) && (
        <MissionsMenu />
      )}
      {overlay === "vehicle_select" && <VehicleMenu />}
      {overlay === "leave_game" && <SessionMenu />}
      {(screen === "social" || overlay === "social") && (
        <Suspense
          fallback={
            <div role="status" className="menu-loading">
              Opening worlds and social…
            </div>
          }
        >
          <SocialPanel />
        </Suspense>
      )}
      {screen === "sandbox" && overlay === "survey_map" && <SurveyMap/>}
      {screen === "sandbox" && overlay === "cockpit" && <CockpitPanel />}
      {(screen === "world_builder" ||
        (screen === "sandbox" && overlay === "world_builder")) && (
        <Suspense fallback={null}>
          <WorldBuilderPanel />
        </Suspense>
      )}

      {screen === "sandbox" && hud && !overlay && <CommandLine />}
      {screen === "sandbox" && !overlay && <PerformanceOverlay />}
      <ModeLoadingScreen />
    </div>
  );
}
