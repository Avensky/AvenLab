// src/components/debugger/DebugMenu.tsx
import { useWorldStore, useUIStore } from "../../store";
import { DebugFlags, hasDebugFlag } from "../../store/tools/debugMasks";

const DEBUG_OPTIONS = [
  ["Chassis", DebugFlags.CHASSIS],
  ["Wheels", DebugFlags.WHEELS],
  ["Suspension Rays", DebugFlags.RAYS],
  ["Slip Vectors", DebugFlags.SLIP],
  ["Load Bars", DebugFlags.LOAD_BARS],
  ["Anti-Roll Bars", DebugFlags.ARB],
  ["Block Colliders", DebugFlags.BLOCKS],
] as const;

const ALL_DEBUG =
  DebugFlags.CHASSIS |
  DebugFlags.WHEELS |
  DebugFlags.RAYS |
  DebugFlags.SLIP |
  DebugFlags.LOAD_BARS |
  DebugFlags.ARB |
  DebugFlags.BLOCKS;

export function DebugMenu() {
  const mode = useWorldStore((s) => s.mode);
  const setMode = useWorldStore((s) => s.setMode);
  const debugMask = useWorldStore((s) => s.debugMask);
  const setDebugMask = useWorldStore((s) => s.setDebugMask);
  const toggleDebugFlag = useWorldStore((s) => s.toggleDebugFlag);
  const onClose = useUIStore((s) => s.closeOverlay);

  return (
    <div className="relative top-0 left-0 z-50 w-72 rounded-lg bg-black/80 p-4 text-white shadow-lg">
      <h2 className="mb-3 text-lg font-bold">Debug Menu</h2>

      <label className="mb-2 block text-sm">View Mode</label>
      <select
        className="mb-4 w-full rounded bg-zinc-800 p-2"
        value={mode}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onChange={(e) => setMode(e.target.value as any)}
      >
        <option value="glb">GLB</option>
        <option value="geometry">Geometry</option>
        <option value="collider">Collider</option>
        <option value="hybrid">Hybrid</option>
      </select>

      <div className="mb-3 flex gap-2">
        <button
          className="rounded bg-red-600 px-2 py-1 text-sm"
          onClick={() => setDebugMask(0)}
        >
          Off
        </button>

        <button
          className="rounded bg-green-600 px-2 py-1 text-sm"
          onClick={() => setDebugMask(ALL_DEBUG)}
        >
          All
        </button>
      </div>

      <div className="space-y-2">
        {DEBUG_OPTIONS.map(([label, flag]) => (
          <label key={label} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hasDebugFlag(debugMask, flag)}
              onChange={() => toggleDebugFlag(flag)}
            />
            {label}
          </label>
        ))}
      </div>
      <div className="space-y-2">
        <button
          className="rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <div className="mt-3 text-xs text-zinc-400">
        mask: {debugMask}
      </div>
    </div>
  );
}