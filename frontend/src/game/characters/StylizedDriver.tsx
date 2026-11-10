import { useEffect, useMemo } from "react";
import type { CharacterLook } from "./characterCatalog";
import { prepareStylizedDriver } from "./stylizedDriverModel";

export function StylizedDriver({ look }: { look: CharacterLook }) {
  const model = useMemo(() => prepareStylizedDriver(look), [look]);
  useEffect(() => model.dispose, [model]);
  return <primitive object={model.root} dispose={null} />;
}
