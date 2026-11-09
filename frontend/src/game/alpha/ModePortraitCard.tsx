import {memo, useId} from "react";
import type {MatchTeamSize} from "../../store/alpha/alphaStore";
import "./modePortrait.css";

export const MATCH_MODE_PORTRAITS = [
  {id:3, title:"3V3", hero:"supra"},
  {id:5, title:"5V5", hero:"tank"},
] as const;
export type PortraitMatchMode = typeof MATCH_MODE_PORTRAITS[number]["id"];

/** Existing vehicle portrait assets share a lightweight scene illustration.
 * Activation selects the format and uses the screen's guarded admission flow;
 * focusing or hovering the card never starts matchmaking. */
export const ModePortraitCard = memo(function ModePortraitCard({mode, selected, disabled, onSelect}: {
  mode: typeof MATCH_MODE_PORTRAITS[number]; selected: boolean; disabled: boolean;
  onSelect:(size: MatchTeamSize)=>void;
}) {
  const gradient = useId().replaceAll(":", "");
  return <button type="button" className="mode-portrait-card menu-panel-frame" data-match-size={mode.id} aria-label={mode.title} aria-pressed={selected} disabled={disabled} onClick={()=>onSelect(mode.id)}>
    <span className="mode-portrait-scene" aria-hidden="true">
      <svg viewBox="0 0 180 220" preserveAspectRatio="xMidYMid slice">
        <defs><linearGradient id={gradient} x2="0" y2="1"><stop stopColor="var(--app-accent)" stopOpacity=".34"/><stop offset="1" stopColor="#081320"/></linearGradient></defs>
        <path fill={`url(#${gradient})`} d="M0 0h180v220H0z"/>
        <path fill="#102738" d="M0 105h20V64h20v31h12V43h28v62h13V74h22v18h12V52h27v53h26v115H0z"/>
        <path d="M0 160l90-29 90 29M90 131v89M0 200l90-69 90 69" fill="none" stroke="var(--app-accent)" strokeOpacity=".3"/>
        <path d="M31 63v63m0-62h31l-9 10 9 10H31M149 63v63m0-62h-31l9 10-9 10h31" fill="none" stroke="var(--app-accent)" strokeWidth="3"/>
      </svg>
      <span className="mode-portrait-format">{mode.title}</span>
      <img src={`/images/heroes/${mode.hero}.webp`} width="320" height="216" alt="" draggable={false} decoding="async"/>
    </span>
  </button>;
});

export function MatchModePortraits({selected, disabled, onSelect}: {selected:MatchTeamSize;disabled:boolean;onSelect:(size:MatchTeamSize)=>void}) {
  return <aside className="match-mode-portraits" aria-label="Match size" data-controller-row data-controller-columns="2">
    {MATCH_MODE_PORTRAITS.map(mode=><ModePortraitCard key={mode.id} mode={mode} selected={selected===mode.id} disabled={disabled} onSelect={onSelect}/>)}
  </aside>;
}
