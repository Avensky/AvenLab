import { useEffect, useMemo } from "react";
import type { CharacterLook } from "./characterCatalog";
import { GarageEmotePlayer } from "./GarageEmotePlayer";
import { prepareStylizedDriver } from "./stylizedDriverModel";

export function StylizedDriver({ look, bag }: { look: CharacterLook; bag: boolean }) {
  const model = useMemo(() => prepareStylizedDriver(look), [look]);
  useEffect(() => model.dispose, [model]);
  return <GarageEmotePlayer root={model.root} bag={bag} />;
}
