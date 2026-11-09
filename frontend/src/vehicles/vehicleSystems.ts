export function vehicleSystems(model: string) {
  if (model === "louisiana" || model === "hawaii-rescue") return "marine";
  return model === "tank" ? "tracked" : "road";
}
