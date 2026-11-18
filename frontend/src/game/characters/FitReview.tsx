import { useId, useState } from "react";
import type { CharacterChoice } from "./characterCatalog";
import { useSocialStore } from "../../store/social/socialStore";
import { FIT_CHECKS, fitReviewKey, fitReviewStatus, useFitReviewStore } from "./fitReviewStore";
import { clothingPieceLabel, wornClothing, type ClothingPiece } from "./clothingPieces";
import { resolveCharacterWardrobe, wardrobeOverEase, WARDROBE_WAIST_OPTIONS, withWardrobeWaist } from "./wardrobe";
import { getWardrobeGarment, visibleWardrobeGarments } from "./wardrobeGarments";

type Subject = { id: string; label: string; kind: "garment" | "emote" };
const checkLabels = { front: "Front", back: "Back", movement: "Animation" };
const statuses = { passed: "✓ Checked", issue: "! Needs work", partial: "◐ In review", untested: "○ Untested" };

export function FitBadge({ choice, piece = "outfit", pose, itemId }: { choice: CharacterChoice; piece?: string; pose?: string; itemId?: string }) {
  const owner = useSocialStore(s => s.view?.profile.id ?? s.profileOwner ?? undefined);
  const key = fitReviewKey(owner, choice, itemId ? `${itemId}:${piece}` : piece, pose);
  const legacyKey = itemId ? fitReviewKey(owner, choice, piece, pose) : key;
  const status = useFitReviewStore(s => fitReviewStatus(s.reviews[key] ?? s.reviews[legacyKey]));
  return <span className={`fit-badge fit-badge--${status}`} aria-label={`Fit ${status}`}>{statuses[status]}</span>;
}

export function FitReview({ choice, piece, pose = "standing", poseLabel = pose, subject, compact = false, note: fitNote }: {
  choice: CharacterChoice; piece?: ClothingPiece; pose?: string; poseLabel?: string; subject: Subject; compact?: boolean; note?: string;
}) {
  const owner = useSocialStore(s => s.view?.profile.id ?? s.profileOwner ?? undefined);
  const legacyPiece = piece ?? "outfit";
  const target = subject.kind === "emote" ? legacyPiece : `${subject.id}:${legacyPiece}`;
  const key = fitReviewKey(owner, choice, target, pose);
  const legacyKey = fitReviewKey(owner, choice, legacyPiece, pose);
  const { reviews, check, note, reset } = useFitReviewStore();
  const review = reviews[key] ?? (piece ? reviews[legacyKey] : undefined);
  const [expanded, setExpanded] = useState(false);
  const fieldsId = useId();
  const [report, setReport] = useState<{ key: string; text: string; message: string }>();
  const wardrobe = choice.removedClothing?.includes("corset") ? undefined : resolveCharacterWardrobe(choice);
  const fit = WARDROBE_WAIST_OPTIONS.find(option => option.waist === wardrobe?.waist && option.ease === wardrobeOverEase(choice));
  const combinations = wardrobe ? WARDROBE_WAIST_OPTIONS.map(({ waist, ease }) =>
    fitReviewKey(owner, withWardrobeWaist(choice, waist, ease), target, pose)) : [key];
  const count = combinations.filter(item => fitReviewStatus(item === key ? review : reviews[item]) === "passed").length;
  const status = fitReviewStatus(review);
  const issueType = subject.kind === "emote" ? "Emote logic" : "Clipping / fit";

  async function copyTicket() {
    const garments = Object.values(visibleWardrobeGarments(choice) ?? {}).map(id => getWardrobeGarment(id)?.label ?? id);
    const text = [
      `[${issueType}] ${subject.label} (${subject.id})`,
      `Character: ${choice.id}`,
      `Outfit: ${choice.outfit}${wardrobe ? ` · ${wardrobe.set}` : ""}`,
      `Visible pieces: ${wornClothing(choice).map(clothingPieceLabel).join(", ") || "None"}`,
      garments.length ? `Selected garments: ${garments.join(", ")}` : "",
      `Pose: ${poseLabel} (${pose}) · Fit: ${fit?.label ?? "Original outfit"}`,
      `Animation fit: ${choice.appearance?.animation_fit ?? "auto"} · Prop: ${choice.prop ?? "none"}`,
      piece ? `Focus: ${clothingPieceLabel(piece)}` : "",
      `Checks: ${FIT_CHECKS.map(item => `${checkLabels[item]} ${review?.checks[item] ? "checked" : "pending"}`).join(", ")}`,
      "",
      review?.issue.trim() ?? "",
    ].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setReport({ key, text: "", message: "Ticket draft copied." });
    } catch {
      setReport({ key, text, message: "Select and copy the ticket draft below." });
    }
  }

  const badge = <span className={`fit-badge fit-badge--${status}`}>{statuses[status]}</span>;
  return <section className="fit-review" aria-label={`${issueType} review`}>
    {compact ? <h3 data-controller-row>
      <button type="button" className="menu-control fit-review-toggle" aria-expanded={expanded} aria-controls={fieldsId}
        onClick={() => setExpanded(!expanded)}>Fit review {badge}</button>
    </h3> : <h3>{issueType} review {badge}</h3>}
    <div id={fieldsId} hidden={compact && !expanded}>
      {fitNote && <p>{fitNote}</p>}
      <p>{piece ? clothingPieceLabel(piece) : subject.label} · {fit?.label ?? "Original outfit"} · {poseLabel}</p>
      <div className="fit-checks" data-controller-row>{FIT_CHECKS.map(item => <label key={item}>
        <input type="checkbox" checked={Boolean(review?.checks[item])}
          onChange={event => check(key, item, event.target.checked, review)} />{checkLabels[item]}
      </label>)}</div>
      <label className="fit-review-notes" data-controller-row>Issue notes
        <textarea className="menu-control" placeholder={subject.kind === "emote" ? "What happened, and what should the emote do?" : "Where does the garment clip, and in which pose?"}
          maxLength={500} value={review?.issue ?? ""} onChange={event => note(key, event.target.value, review)} />
      </label>
      {combinations.length > 1 && <small>{count}/{combinations.length} waist fits checked.</small>}
      <div className="fit-review-actions" data-controller-row>
        <button type="button" className="menu-control" disabled={!review?.issue.trim()} onClick={() => void copyTicket()}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="M5 3h8v10H5z M3 11H2V1h8v1 M7 6h4M7 9h4" /></svg>
          Copy ticket draft
        </button>
        <button type="button" className="menu-control" disabled={!review} onClick={() => {
          if (key !== legacyKey && reviews[legacyKey]) {
            reset(key, true);
          } else reset(key);
          setReport(undefined);
        }}>Clear review</button>
      </div>
      {report?.key === key && <p role="status">{report.message}</p>}
      {report?.key === key && report.text && <textarea className="menu-control" readOnly aria-label="Ticket draft" value={report.text} onFocus={event => event.target.select()} />}
    </div>
  </section>;
}
