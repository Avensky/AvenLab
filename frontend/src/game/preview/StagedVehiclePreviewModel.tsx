import { Suspense, useLayoutEffect, useState, type ComponentProps, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { VEHICLE_MODEL_PATHS } from "../../vehicles/tools/vehicleModelPaths";
import { VehiclePreviewModel } from "./VehiclePreviewModel";

// Suspend only the detailed request. The displayed car keeps its scene, paint,
// and driver placement until the replacement can mount synchronously from cache.
function WaitForDetailedVehicle({ path, onReady }: { path: string; onReady: (ready: true) => void }) {
  useGLTF(path, "/draco/");
  useLayoutEffect(() => onReady(true), [onReady]);
  return null;
}

export function StagedVehiclePreviewModel({ browse, unavailable, ...props }: ComponentProps<typeof VehiclePreviewModel> & {
  browse: boolean;
  unavailable: ReactNode;
}) {
  const preview = typeof __HEROES_VEHICLE_PREVIEWS__ === "undefined" ? undefined : __HEROES_VEHICLE_PREVIEWS__[props.model];
  const [detailed, setDetailed] = useState(!browse);
  const fullCar = <VehiclePreviewModel {...props} />;
  if (!preview || detailed) return fullCar;

  return <AssetBoundary fallback={fullCar}>
    <VehiclePreviewModel {...props} showroomPath={preview}
      garageOpen={false} garageCameraAnchors={false} previewPacks={false} />
    {!browse && <AssetBoundary fallback={unavailable}>
      <Suspense fallback={null}>
        <WaitForDetailedVehicle path={VEHICLE_MODEL_PATHS[props.model]} onReady={setDetailed} />
      </Suspense>
    </AssetBoundary>}
  </AssetBoundary>;
}
