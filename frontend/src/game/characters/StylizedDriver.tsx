import type { MirrorCheckFit } from "./mirrorCheck";
import { clothingColors } from "./clothingPieces";
import { useEffect, useMemo } from "react";
import type { CharacterLook } from "./characterCatalog";
import { GarageEmotePlayer, type VictoryPlayback } from "./GarageEmotePlayer";
import { prepareStylizedDriver } from "./stylizedDriverModel";
import type { GarageCockpit } from "../preview/garageCockpit";

export function StylizedDriver({ look, bag, previewPacks, mirrorFit, victory, cockpit }: {
  look: CharacterLook; bag: boolean; previewPacks?: boolean; mirrorFit?: MirrorCheckFit; victory?: VictoryPlayback; cockpit?: GarageCockpit;
}) {
  const model = useMemo(() => prepareStylizedDriver(look), [look]);
  useEffect(() => model.dispose, [model]);
  return <GarageEmotePlayer root={model.root} bag={bag} personality={look.appearance.personality} bagColors={clothingColors(look, "bag")} previewPacks={previewPacks} mirrorFit={mirrorFit} victory={victory} cockpit={cockpit} />;
}
