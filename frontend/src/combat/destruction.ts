export type DestructionSettings = { enabled: boolean; hp: number; smallArms: number; cannon: number; bomb: number; rubble: "clear" | "cover" };
export const destructionDefaults: DestructionSettings = { enabled: false, hp: 1000, smallArms: 0.05, cannon: 1, bomb: 1.5, rubble: "clear" };
export function validateDestruction(value: unknown): asserts value is DestructionSettings {
  const v = value as DestructionSettings;
  if (!v || typeof v.enabled !== "boolean" || !["clear", "cover"].includes(v.rubble) ||
    !Number.isFinite(v.hp) || v.hp < 1 || v.hp > 1000000 ||
    [v.smallArms,v.cannon,v.bomb].some(n => !Number.isFinite(n) || n < 0 || n > 10)) throw Error("Invalid asset damage settings");
}
/** Authoring-only estimate, not a client-authoritative damage command. */
export const estimatedDamage = (s: DestructionSettings, kind: "smallArms" | "cannon" | "bomb", damage: number) => s.enabled ? Math.max(0, damage) * s[kind] : 0;
