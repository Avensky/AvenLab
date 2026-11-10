import { useEffect, useMemo } from "react";
import type { CharacterLook } from "./characterCatalog";
import { GarageEmotePlayer, type VictoryPlayback } from "./GarageEmotePlayer";
import { prepareStylizedDriver } from "./stylizedDriverModel";

export function StylizedDriver({ look, bag, previewVictory, victory }: {
  look: CharacterLook; bag: boolean; previewVictory?: boolean; victory?: VictoryPlayback;
}) {
  const model = useMemo(() => prepareStylizedDriver(look), [look]);
  useEffect(() => model.dispose, [model]);
  return <GarageEmotePlayer root={model.root} bag={bag} previewVictory={previewVictory} victory={victory} />;
}
