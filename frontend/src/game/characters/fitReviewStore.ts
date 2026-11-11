import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CharacterChoice } from "./characterCatalog";
import { resolveWardrobe } from "./wardrobe";
export const FIT_REVISION = "wardrobe-9";
const setFitRevisions: Record<string, string> = { "gothic-01": FIT_REVISION, "gothic-02": "wardrobe-8", "gothic-04": "wardrobe-7", "gothic-05": "wardrobe-7" };
export const FIT_CHECKS = ["front", "back", "movement"] as const;
export type FitCheck = typeof FIT_CHECKS[number];
type Review = { checks: Partial<Record<FitCheck, boolean>>; issue: string; updated: string };
export function fitReviewKey(owner: string | undefined, choice: CharacterChoice, piece: string, pose = "standing") {
 const w = resolveWardrobe(choice.wardrobe);
 const revision = w?.set === "gothic-02" && w.waist === "tucked" ? FIT_REVISION : (w && setFitRevisions[w.set]) ?? "wardrobe-6";
 return JSON.stringify([revision, owner ?? "local", choice.id, w?.set ?? choice.outfit, w?.shirt ?? "original", w?.waist ?? "original", choice.appearance?.animation_fit ?? "auto", choice.appearance?.glasses ?? "none", choice.prop ?? "none", piece, pose]);
}
export function fitReviewStatus(review?: Review) { return review?.issue.trim() ? "issue" : FIT_CHECKS.every(check => review?.checks[check]) ? "passed" : review ? "partial" : "untested"; }
export const useFitReviewStore = create(persist<{
 reviews: Record<string, Review>; check: (key: string, check: FitCheck, value: boolean) => void; note: (key: string, issue: string) => void; reset: (key: string) => void;
}>((set) => ({
 reviews: {},
 check: (key, check, value) => set(s => ({ reviews: { ...s.reviews, [key]: { ...s.reviews[key], issue: s.reviews[key]?.issue ?? "", checks: { ...s.reviews[key]?.checks, [check]: value }, updated: new Date().toISOString() } } })),
 note: (key, issue) => set(s => ({ reviews: { ...s.reviews, [key]: { ...s.reviews[key], checks: s.reviews[key]?.checks ?? {}, issue: issue.slice(0, 500), updated: new Date().toISOString() } } })),
 reset: key => set(s => { const reviews = { ...s.reviews }; delete reviews[key]; return { reviews }; }),
}), { name: "avenlab-fit-reviews-v1", storage: createJSONStorage(() => localStorage) }));
