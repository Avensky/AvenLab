export function RepairGauge({ condition }: { condition: number | null }) {
  return <div className="repair-gauge resource-line" data-damaged={condition !== null && condition < .75} role="meter" aria-label="Vehicle condition"
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={condition === null ? undefined : Math.round(condition * 100)}
    aria-valuetext={condition === null ? "Unavailable" : `${Math.round(condition * 100)} percent condition`} title="Vehicle condition · collision and engine wear">
    <span>CONDITION</span><strong>{condition === null ? "—" : `${Math.round(condition * 100)}%`}</strong>
    <i aria-hidden="true"><b style={{ transform: `scaleX(${condition ?? 0})` }} /></i>
  </div>;
}
