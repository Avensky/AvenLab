import { memo } from 'react';
import './ultimateChargeArc.css';

const halfTrack = {
  portrait: 'M50 3H91L97 9V91L91 97H50',
  dial: 'M50 4A46 46 0 0 1 50 96',
};

/** Each stroke owns half the perimeter. At half charge both tips are at
 * the sides, leaving the bottom half visibly empty at every HUD scale. */
export const UltimateChargeArc = memo(function UltimateChargeArc({shape, fraction}: {
  shape: keyof typeof halfTrack;
  fraction: number | null;
}) {
  const d = halfTrack[shape];
  const offset = 1 - (fraction ?? 0);
  if (shape === 'portrait') {
    // Two complete concentric tracks share a top origin and travel in opposite directions.
    const ring = 'M50 3H90L97 10V90L90 97H10L3 90V10L10 3Z';
    const inner = 'translate(94 6) scale(-.88 .88)';
    return <svg className="ultimate-charge-arc portrait-charge" viewBox="0 0 100 100" aria-hidden="true">
      <path className="charge-track" d={ring}/><path className="charge-track" d={ring} transform={inner}/>
      <path className="charge-outer" d={ring} pathLength="1" strokeDasharray="1 1" strokeDashoffset={offset}/>
      <path className="charge-inner" d={ring} transform={inner} pathLength="1" strokeDasharray="1 1" strokeDashoffset={offset}/>
    </svg>;
  }
  return <svg className="ultimate-charge-arc" viewBox="0 0 100 100" aria-hidden="true">
    <path className="charge-track" d={d} />
    <path className="charge-track" d={d} transform="translate(100 0) scale(-1 1)" />
    <path className="charge-outer" d={d} pathLength="1" strokeDasharray="1 1" strokeDashoffset={offset} />
    <path className="charge-inner" d={d} pathLength="1" strokeDasharray="1 1" strokeDashoffset={offset} transform="translate(100 0) scale(-1 1)" />
  </svg>;
});
