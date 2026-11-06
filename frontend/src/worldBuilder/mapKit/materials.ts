/** Semantic names survive the road-kit GLB export at every LOD. */
export function isHighwayBorderMaterial(meshName: string, materialName: string) {
  const role = `${meshName} ${materialName}`;
  return /(?:^|[\s_.-])(?:guardrail|guard_rail|rail|railing|border|barrier|metal|steel)(?:$|[\s_.-])/i.test(role);
}
