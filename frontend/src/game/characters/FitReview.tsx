import type { CharacterChoice } from "./characterCatalog";
import { useSocialStore } from "../../store/social/socialStore";
import { FIT_CHECKS, fitReviewKey, fitReviewStatus, useFitReviewStore } from "./fitReviewStore";
import { WARDROBE_SETS, resolveWardrobe } from "./wardrobe";
export function FitBadge({ choice, piece = "outfit", pose }: { choice: CharacterChoice; piece?: string; pose?: string }) {
 const owner = useSocialStore(s => s.view?.profile.id), key = fitReviewKey(owner, choice, piece, pose);
 const status = useFitReviewStore(s => fitReviewStatus(s.reviews[key]));
 return <span className={`fit-badge fit-badge--${status}`} title={`This combination: ${status}`} aria-label={`Fit ${status}`}>{status === "passed" ? "✓ Checked" : status === "issue" ? "! Needs work" : status === "partial" ? "◐ In review" : "○ Untested"}</span>;
}
export function FitReview({ choice, piece = "outfit", pose = "standing" }: { choice: CharacterChoice; piece?: string; pose?: string }) {
 const owner = useSocialStore(s => s.view?.profile.id), key = fitReviewKey(owner, choice, piece, pose);
 const { reviews, check, note, reset } = useFitReviewStore(), review = reviews[key];
 const w = resolveWardrobe(choice.wardrobe), set = WARDROBE_SETS.find(set => set.id === w?.set);
 const combinations = w ? (["none", "under", "over"] as const).filter(shirt => shirt !== "none" || !set?.requiresShirt).flatMap(shirt => (["tucked", "over"] as const).map(waist => fitReviewKey(owner, { ...choice, wardrobe: { ...w, shirt, waist } }, piece, pose))) : [key];
 const count = combinations.filter(key => fitReviewStatus(reviews[key]) === "passed").length;
 return <section className="fit-review" aria-label="In-game fit checks">
  <h3>Fit checks <FitBadge choice={choice} piece={piece} pose={pose} /></h3>
  <p>{piece} · {w ? `${w.shirt === "none" ? "no shirt" : `shirt ${w.shirt}`} · ${w.waist}` : "original outfit"} · {pose}</p>
  <div className="fit-checks" data-controller-row>{FIT_CHECKS.map(item => <label key={item}><input type="checkbox" checked={Boolean(review?.checks[item])} onChange={e => check(key, item, e.target.checked)} />{item === "movement" ? "Animation" : item === "front" ? "Front" : "Back"}</label>)}</div>
  <textarea className="menu-control" aria-label="Fit issue notes" placeholder="Clipping, loose straps, or other issues…" maxLength={500} value={review?.issue ?? ""} onChange={e => note(key, e.target.value)} />
  <small>{count}/{combinations.length} shirt/waist combinations checked for this item and pose. Saved on this device.</small>
  <button type="button" className="menu-control" onClick={() => reset(key)}>Clear this check</button>
 </section>;
}
