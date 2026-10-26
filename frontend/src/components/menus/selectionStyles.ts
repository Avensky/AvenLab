export function getSelectionClasses(selected: boolean, translucent = false) {
  if (translucent) {
    return selected
      ? "border-cyan-300/45 bg-cyan-500/10"
      : "border-cyan-400/20 bg-slate-950/20";
  }
  return selected
    ? "border-cyan-300/45 bg-[radial-gradient(ellipse_at_center,_rgba(30,41,59,0.72)_20%,_rgba(8,47,73,0.3)_60%,_rgba(2,6,23,0.9)_100%)] shadow-[inset_0_0_18px_rgba(0,0,0,0.55),0_0_12px_rgba(34,211,238,0.08)]"
    : "border-slate-800/80 bg-slate-950/90 shadow-[inset_0_0_30px_rgba(0,0,0,0.9)]";
}
