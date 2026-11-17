import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CharacterChoice } from "./characterCatalog";
import { hasTuckedUnderbust, resolveCharacterWardrobe, UNDERBUST_WARDROBE_SET, wardrobeOverEase } from "./wardrobe";
import { removedWardrobeLayers } from "./wardrobeGarments";
export const FIT_REVISION = "wardrobe-10";
const setFitRevisions: Record<string, string> = { "gothic-01": "wardrobe-16", "gothic-02": "wardrobe-15", "gothic-04": "wardrobe-16", "gothic-05": "wardrobe-15" };
export const FIT_CHECKS = ["front", "back", "movement"] as const;
export type FitCheck = typeof FIT_CHECKS[number];
type Review = { checks: Partial<Record<FitCheck, boolean>>; issue: string; updated: string };
export function fitReviewKey(owner: string | undefined, choice: CharacterChoice, piece: string, pose = "standing") {
 const w = resolveCharacterWardrobe(choice);
 const revision = w?.set === UNDERBUST_WARDROBE_SET && w.waist === "tucked" && hasTuckedUnderbust() ? "wardrobe-18"
  : w?.set === UNDERBUST_WARDROBE_SET && w.waist === "over" ? "wardrobe-17"
  : w?.set === "gothic-03" && w.waist === "tucked" ? FIT_REVISION : (w && setFitRevisions[w.set]) ?? "wardrobe-6";
 const garments = Object.entries(choice.garments ?? {}).sort(([a], [b]) => a.localeCompare(b));
 const base = choice.wardrobeTrial ? ["separates", choice.wardrobe?.set ?? choice.outfit, choice.wardrobe?.waist ?? "original"] : [];
 const ease = wardrobeOverEase(choice);
 const removed = [...removedWardrobeLayers(choice)].sort();
 return JSON.stringify([revision, owner ?? "local", choice.id, w?.set ?? choice.outfit, w?.shirt ?? "original", w?.waist ?? "original",
  choice.appearance?.animation_fit ?? "auto", choice.appearance?.glasses ?? "none", choice.prop ?? "none", piece, pose, ...base,
  ...(garments.length ? [garments] : []), ...(ease ? [ease] : []), ...(removed.length ? [{ removed }] : []),
  ...(w?.cut ? [{ cut: w.cut }] : []), ...(choice.bra !== undefined ? [{ bra: choice.bra }] : []),
  ...(choice.appearance?.bra_style === "push-up" && (choice.bra ?? removed.some(slot => slot === "top" || slot === "corset"))
    ? [{ braStyle: "push-up" }] : [])]);
}
export function fitReviewStatus(review?: Review) { return review?.issue.trim() ? "issue" : FIT_CHECKS.every(check => review?.checks[check]) ? "passed" : FIT_CHECKS.some(check => review?.checks[check]) ? "partial" : "untested"; }
export const useFitReviewStore = create(persist<{
 reviews: Record<string, Review>; check: (key: string, check: FitCheck, value: boolean, initial?: Review) => void; note: (key: string, issue: string, initial?: Review) => void; reset: (key: string, hideLegacy?: boolean) => void;
}>((set) => ({
 reviews: {},
 check: (key, check, value, initial) => set(s => ({ reviews: { ...s.reviews, [key]: { ...s.reviews[key], issue: s.reviews[key]?.issue ?? initial?.issue ?? "", checks: { ...initial?.checks, ...s.reviews[key]?.checks, [check]: value }, updated: new Date().toISOString() } } })),
 note: (key, issue, initial) => set(s => ({ reviews: { ...s.reviews, [key]: { ...s.reviews[key], checks: s.reviews[key]?.checks ?? initial?.checks ?? {}, issue: issue.slice(0, 500), updated: new Date().toISOString() } } })),
 reset: (key, hideLegacy) => set(s => {
   const reviews = { ...s.reviews };
   if (hideLegacy) reviews[key] = { checks: {}, issue: "", updated: new Date().toISOString() };
   else delete reviews[key];
   return { reviews };
 }),
}), { name: "avenlab-fit-reviews-v1", storage: createJSONStorage(() => localStorage) }));
