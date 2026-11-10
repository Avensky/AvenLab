import { useEffect, useMemo } from "react";
import type { CharacterLook } from "./characterCatalog";
import { GarageEmotePlayer, type VictoryPlayback } from "./GarageEmotePlayer";
import { prepareStylizedDriver } from "./stylizedDriverModel";
import type { GarageCockpit } from "../preview/garageCockpit";

export function StylizedDriver({ look, bag, previewPacks, victory, cockpit }: {
  look: CharacterLook; bag: boolean; previewPacks?: boolean; victory?: VictoryPlayback; cockpit?: GarageCockpit;
}) {
  const model = useMemo(() => prepareStylizedDriver(look), [look]);
  useEffect(() => model.dispose, [model]);
  return <GarageEmotePlayer root={model.root} bag={bag} previewPacks={previewPacks} victory={victory} cockpit={cockpit} />;
}
