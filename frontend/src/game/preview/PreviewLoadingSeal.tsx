import { Html } from "@react-three/drei";
import "./previewLoadingSeal.css";

export function PreviewLoadingStatus({ label }: { label: string }) {
  return <Html center position={[0, .56, 0]} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
    <div className="preview-loading-seal" role="status">{label}</div>
  </Html>;
}
