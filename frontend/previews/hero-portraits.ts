import { bakeHeroPortrait } from "../src/game/preview/bakeHeroPortrait";
import {
  VEHICLE_MODEL_PATHS,
  type VehicleModelId,
} from "../src/vehicles/tools/vehicleModelPaths";
Object.assign(window, { bakeHeroPortrait });
const button = document.querySelector<HTMLButtonElement>("#bake")!;
button.onclick = async () => {
  button.disabled = true;
  const gallery = document.querySelector("#portraits")!;
  gallery.replaceChildren();
  try {
    for (const model of Object.keys(VEHICLE_MODEL_PATHS) as VehicleModelId[]) {
      const url = await bakeHeroPortrait(model);
      const link = document.createElement("a");
      link.href = url;
      link.download = model + ".webp";
      const image = document.createElement("img");
      image.src = url;
      image.alt = model;
      image.width = 320;
      image.height = 216;
      link.append(image);
      gallery.append(link);
    }
  } finally {
    button.disabled = false;
  }
};
