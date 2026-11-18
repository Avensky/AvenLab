import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CharacterChoice } from "./characterCatalog";
import { hasTuckedUnderbust, resolveCharacterWardrobe, resolveWardrobe, UNDERBUST_WARDROBE_SET, wardrobeOverEase } from "./wardrobe";
import { removedWardrobeLayers, visibleWardrobeGarments } from "./wardrobeGarments";
export const FIT_REVISION = "wardrobe-10";
const setFitRevisions: Record<string, string> = { "gothic-01": "wardrobe-19", "gothic-02": "wardrobe-15", "gothic-04": "wardrobe-16", "gothic-05": "wardrobe-15" };
export const FIT_CHECKS = ["front", "back", "movement"] as const;
export type FitCheck = typeof FIT_CHECKS[number];
type Review = { checks: Partial<Record<FitCheck, boolean>>; issue: string; updated: string };
export function fitReviewKey(owner: string | undefined, choice: CharacterChoice, piece: string, pose = "standing") {
 const w = resolveCharacterWardrobe(choice);
 const removed = [...removedWardrobeLayers(choice)].sort();
 const bra = choice.bra ?? removed.some(slot => slot === "top" || slot === "corset");
 const revision = !w && bra ? "bra-2"
  : w?.set === UNDERBUST_WARDROBE_SET && (w.waist === "over" || hasTuckedUnderbust()) ? "wardrobe-19"
  : w?.set === "gothic-03" && w.waist === "tucked" ? FIT_REVISION : (w && setFitRevisions[w.set]) ?? "wardrobe-6";
 const garments = Object.entries(choice.garments ?? {}).sort(([a], [b]) => a.localeCompare(b));
 const visible = visibleWardrobeGarments(choice);
 const gothicSkirt = !removed.includes("skirt") && !removed.includes("outer-skirt") && !visible?.dress &&
  (visible?.skirt ? /^gothic-skirt-0[1-5]$/.test(visible.skirt) : Boolean(resolveWardrobe(choice.wardrobe)));
 const highGothicWaist = gothicSkirt && /^gothic-(?:skirt-)?0[25]$/.test(visible?.skirt ?? resolveWardrobe(choice.wardrobe)?.set ?? "");
 // The other bundled skirts already have their own layer treatment.
 const repairedSkirtLayers = gothicSkirt && (visible?.skirt ? /^gothic-skirt-0[135]$/.test(visible.skirt)
  : resolveWardrobe(choice.wardrobe)?.set === "gothic-01");
 const shortSkirtTuck = /^skirt-0[1-4]$/.test(visible?.skirt ?? "") && w?.waist === "tucked"
  && !removed.includes("top") && !removed.includes("corset");
 const reviewedPiece = piece.slice(piece.lastIndexOf(":") + 1);
 const base = choice.wardrobeTrial ? ["separates", choice.wardrobe?.set ?? choice.outfit, choice.wardrobe?.waist ?? "original"] : [];
 const ease = wardrobeOverEase(choice);
 return JSON.stringify([revision, owner ?? "local", choice.id, w?.set ?? choice.outfit, w?.shirt ?? "original", w?.waist ?? "original",
  choice.appearance?.animation_fit ?? "auto", choice.appearance?.glasses ?? "none", choice.prop ?? "none", piece, pose, ...base,
  ...(garments.length ? [garments] : []), ...(ease ? [ease] : []), ...(removed.length ? [{ removed }] : []),
  ...(w?.cut ? [{ cut: w.cut }] : []), ...(choice.bra !== undefined ? [{ bra: choice.bra }] : []),
  ...(choice.appearance?.bra_style === "push-up" && bra ? [{ braStyle: "push-up" }] : []),
  ...(reviewedPiece === "briefs" ? [choice.appearance?.briefs_style === "boxer-briefs" ? "boxer-briefs-1" : "v-cut-briefs-1"] : []),
  ...(reviewedPiece === "bra" && choice.appearance?.bra_style === "push-up" ? ["push-up-cups-2"] : []),
  ...(gothicSkirt ? ["gothic-skirt-waist-3-subtle"] : []),
  ...(highGothicWaist ? ["gothic-skirt-02-05-high-waist-1"] : []),
  ...(repairedSkirtLayers ? ["gothic-skirt-covered-layers-1"] : []),
  ...(reviewedPiece === "bow" && !removed.includes("bow") ? ["neck-bow-2-settled"] : []),
  ...(shortSkirtTuck ? ["short-skirt-tuck-1-no-expansion"] : []),
  ...(/^skirt-0[1-4]$/.test(choice.garments?.skirt ?? "") && !removed.includes("skirt") ? ["short-skirt-drape-2"] : []),
  ...(/^skirt-0[1-4]$/.test(visible?.skirt ?? "") ? ["short-skirt-fabric-1"] : []),
  ...(choice.garments?.top === "top-02" && !removed.includes("top") ? ["top-02-armhole-cut-1"] : []),
  ...((choice.garments?.top === "top-03" || choice.garments?.top === "top-04") && !removed.includes("top") ? [choice.garments.top === "top-04" ? "top-04-5" : "top-03-2"] : [])]);
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
