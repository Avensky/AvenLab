import { Html } from "@react-three/drei";
import "./previewLoadingSeal.css";

/** Suspense fallback. The CSS animation runs independently of the 3D scene. */
export function PreviewLoadingSeal({ label, height = .82 }: { label: string; height?: number }) {
  return (
    <Html center position={[0, height, 0]} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
      <div className="preview-loading-seal" role="status">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <g className="preview-seal-orbit">
            <circle cx="32" cy="32" r="28" fill="none" strokeDasharray="36 8 19 9" />
            <path d="m32 1 3 3-3 3-3-3zM1 32l3-3 3 3-3 3zM63 32l-3-3-3 3 3 3zM32 63l3-3-3-3-3 3z" fill="currentColor" />
          </g>
          <g className="preview-seal-runes" fill="none">
            <path d="M32 12 50 42H14zM32 52 14 22h36z" />
            <circle cx="32" cy="32" r="18" strokeDasharray="2 4" />
          </g>
          <path className="preview-seal-core" d="m32 24 2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="currentColor" />
        </svg>
        <span>{label}</span>
      </div>
    </Html>
  );
}
