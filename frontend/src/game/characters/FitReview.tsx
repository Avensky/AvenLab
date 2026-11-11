import type { CharacterChoice } from "./characterCatalog";
import { useSocialStore } from "../../store/social/socialStore";
import { FIT_CHECKS, fitReviewKey, fitReviewStatus, useFitReviewStore } from "./fitReviewStore";
import { resolveWardrobe } from "./wardrobe";
export function FitBadge({ choice, piece = "outfit", pose }: { choice: CharacterChoice; piece?: string; pose?: string }) {
 const owner = useSocialStore(s => s.view?.profile.id), key = fitReviewKey(owner, choice, piece, pose);
 const status = useFitReviewStore(s => fitReviewStatus(s.reviews[key]));
 return <span className={`fit-badge fit-badge--${status}`} title={`This combination: ${status}`} aria-label={`Fit ${status}`}>{status === "passed" ? "✓ Checked" : status === "issue" ? "! Needs work" : status === "partial" ? "◐ In review" : "○ Untested"}</span>;
}
export function FitReview({ choice, piece = "outfit", pose = "standing", poseLabel = pose }: { choice: CharacterChoice; piece?: string; pose?: string; poseLabel?: string }) {
 const owner = useSocialStore(s => s.view?.profile.id), key = fitReviewKey(owner, choice, piece, pose);
 const { reviews, check, note, reset } = useFitReviewStore(), review = reviews[key];
 const w = resolveWardrobe(choice.wardrobe);
 const combinations = w ? (["tucked", "over"] as const).map(waist => fitReviewKey(owner, { ...choice, wardrobe: { ...w, waist } }, piece, pose)) : [key];
 const count = combinations.filter(key => fitReviewStatus(reviews[key]) === "passed").length;
 return <section className="fit-review" aria-label="In-game fit checks">
  <h3>Fit checks <FitBadge choice={choice} piece={piece} pose={pose} /></h3>
  <p>{piece} · {w?.waist ?? "original outfit"} · {poseLabel}</p>
  <div className="fit-checks" data-controller-row>{FIT_CHECKS.map(item => <label key={item}><input type="checkbox" checked={Boolean(review?.checks[item])} onChange={e => check(key, item, e.target.checked)} />{item === "movement" ? "Animation" : item === "front" ? "Front" : "Back"}</label>)}</div>
  <div data-controller-row data-controller-columns="1">
   <textarea className="menu-control" aria-label="Fit issue notes" placeholder="Clipping, loose straps, or other issues…" maxLength={500} value={review?.issue ?? ""} onChange={e => note(key, e.target.value)} />
   <small>{count}/{combinations.length} waist fits checked for this item and pose. Saved on this device.</small>
   <button type="button" className="menu-control fit-review-clear" onClick={() => reset(key)}>Clear this check</button>
  </div>
 </section>;
}
