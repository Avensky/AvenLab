import {HarborBuildings, HarborBuildingLods, HarborStreet} from "../../world/props/HarborStructures";
import {garageVisual, usesGarage} from "../../world/props/harborGarage";
import { kitAsset } from "../mapKit/catalog";
import { KitInstances, KitMesh } from "../mapKit/KitMesh";
import { CARRIER,LIFT } from "../generation/harborPieces";
import { BigEDocked,BridgeLeaf } from "../../world/props/HarborPieces";
import { streetProp } from "../props/streetPropCatalog";
import { StreetPropInstances, StreetPropPreview } from "../props/StreetPropMeshes";
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, InstancedMesh, Object3D } from "three";
import {
  partTransform,
  type LayoutObject,
  type LayoutPart,
} from "../document/layoutDocument";
import { createWedgeGeometry } from "../document/layoutGeometry";
import { ModelInstances, ModelMesh } from "../models/ModelMeshes";
import { RoadInstances, RoadModel } from "../roads/RoadMeshes";
import { localBounds } from "../roads/layoutSnapping";
import { useEditorPreferences } from "../state/editorPreferences";
import { VehicleInstances, VehicleMesh } from "../vehicles/VehicleProps";

function useGeometries() {
  const geometries = useMemo(
    () => ({ box: new BoxGeometry(), wedge: createWedgeGeometry() }),
    [],
  );
  useEffect(
    () => () => {
      geometries.box.dispose();
      geometries.wedge.dispose();
    },
    [geometries],
  );
  return geometries;
}
type Instance = { item: LayoutObject; part: LayoutPart };
function ShapeInstances({
  items,
  shape,
  wireframe,
  onSelect,
}: {
  items: Instance[];
  shape: "box" | "wedge";
  wireframe: boolean;
  onSelect?: (id: string) => void;
}) {
  const mesh = useRef<InstancedMesh>(null),
    geometries = useGeometries();
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const transform = new Object3D(),
      tint = new Color();
    items.forEach(({ item, part }, i) => {
      const value = partTransform(item, part);
      transform.position.fromArray(value.position);
      transform.rotation.set(0, value.yaw, 0);
      transform.scale.fromArray(value.size);
      transform.updateMatrix();
      mesh.current!.setMatrixAt(i, transform.matrix);
      mesh.current!.setColorAt(i, tint.set(part.color ?? item.color));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor)
      mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [items]);
  if (!items.length) return null;
  return (
    <instancedMesh
      key={items.length}
      ref={mesh}
      args={[geometries[shape], undefined, items.length]}
      onClick={
        onSelect
          ? (e) => {
              if (e.button === 0 && e.delta < 5 && e.instanceId !== undefined) {
                e.stopPropagation();
                onSelect(items[e.instanceId].item.id);
              }
            }
          : undefined
      }
    >
      <meshStandardMaterial
        roughness={0.9}
        metalness={0.025}
        wireframe={wireframe}
      />
    </instancedMesh>
  );
}
// Starter shapes use two instanced draws; road modules share cached GLB resources.
export const LayoutInstances = memo(function LayoutInstances({
  objects,
  live = false,
  exclude = null,
  wireframe = false,
  collisionOnly = false,
  onSelect,
}: {
  objects: LayoutObject[];
  live?: boolean;
  exclude?: string | null;
  wireframe?: boolean;
  collisionOnly?: boolean;
  onSelect?: (id: string) => void;
}) {
  const props = useMemo(() => collisionOnly || wireframe ? [] :
    objects.filter(o => o.id !== exclude && streetProp(o.piece)), [objects, exclude, collisionOnly, wireframe]);
  const detailed=!wireframe && !collisionOnly;
  const buildings=useMemo(()=>detailed?objects.filter(o=>o.id!==exclude && o.piece==="coastal-building"):[],[objects,exclude,detailed]);
  const visualModels=useMemo(()=>detailed?objects.map(o=>usesGarage(o.piece)?garageVisual(o):o):objects,[objects,detailed]);
  const propFallback = useMemo(() => props.flatMap(item => item.parts.map(part => ({item,part}))), [props]);
  const items = useMemo(
    () =>
      objects
        .filter(
          (o) =>
            !(live && o.piece === LIFT) &&
            (collisionOnly || wireframe || (o.piece !== CARRIER && !streetProp(o.piece) && o.piece!=="coastal-building" && o.piece!=="coastal-road" && !usesGarage(o.piece))) &&
            !o.road &&
            !o.model &&
            !o.vehicle &&
            o.id !== exclude &&
            (!collisionOnly || o.solid),
        )
        .flatMap((item) =>
          item.parts
            .filter((part) => !collisionOnly || part.solid !== false)
            .map((part) => ({ item, part })),
        ),
    [objects, exclude, collisionOnly, wireframe, live],
  );
  const boxes = useMemo(
    () => items.filter((i) => i.part.shape === "box"),
    [items],
  );
  const wedges = useMemo(
    () => items.filter((i) => i.part.shape === "wedge"),
    [items],
  );
  return (
    <>
      <ShapeInstances
        items={boxes}
        shape="box"
        wireframe={wireframe}
        onSelect={onSelect}
      />
      <ShapeInstances
        items={wedges}
        shape="wedge"
        wireframe={wireframe}
        onSelect={onSelect}
      />
      {live && objects.filter(o=>o.piece===LIFT && o.id!==exclude).map(o=><BridgeLeaf key={o.id} item={o} wireframe={wireframe}/> )}
      {!collisionOnly && !wireframe && objects.filter(o=>o.piece===CARRIER && o.id!==exclude).map(o=>(
        <group key={o.id} position={o.position} rotation={[0,o.yaw*Math.PI/180,0]} scale={o.size}
          onClick={onSelect?e=>{e.stopPropagation();onSelect(o.id);}:undefined}>
          <BigEDocked fallback={<group>{o.parts.map((p,i)=><mesh key={i} position={p.position} scale={p.size}>
            <boxGeometry/><meshStandardMaterial color={o.color}/></mesh>)}</group>}/>
        </group>
      ))}
      {detailed && objects.filter(o=>o.piece==="coastal-road" && o.id!==exclude).map(o=>
        <group key={o.id} position={o.position} rotation={[0,o.yaw*Math.PI/180,0]} scale={o.size}
          onClick={onSelect?e=>{if(e.button===0&&e.delta<5){e.stopPropagation();onSelect(o.id);}}:undefined}>
          <HarborStreet item={o}/>
        </group>)}
      {buildings.length>0 && <HarborBuildingLods items={buildings} onSelect={onSelect}
        renderProxy={items=><ShapeInstances items={items.flatMap(item=>item.parts.map(part=>({item,part})))}
          shape="box" wireframe={false} onSelect={onSelect}/>}/>}
      <StreetPropInstances objects={props} onSelect={onSelect} fallback={<ShapeInstances items={propFallback} shape="box" wireframe={false} onSelect={onSelect}/>}/>
      <KitInstances objects={objects} exclude={exclude} collisionOnly={collisionOnly} wireframe={wireframe} onSelect={onSelect}/>
      <RoadInstances
        objects={objects}
        exclude={exclude}
        collisionOnly={collisionOnly}
        wireframe={wireframe}
        onSelect={onSelect}
      />
      <VehicleInstances
        objects={objects}
        exclude={exclude}
        collisionOnly={collisionOnly}
        onSelect={onSelect}
      />
      <ModelInstances
        objects={visualModels}
        exclude={exclude}
        collisionOnly={collisionOnly}
        wireframe={wireframe}
        onSelect={onSelect}
      />
    </>
  );
});

// Normalized local geometry lets TransformControls resize a whole compound
// piece without losing its doorway or turning a ramp into a bounding box.
export function PieceModel({
  item,
  ghost = false,
  selected = false,
  wireframe = false,
  collisionOnly = false,
  forceDetail = false,
}: {
  item: LayoutObject;
  ghost?: boolean;
  selected?: boolean;
  wireframe?: boolean;
  collisionOnly?: boolean;
  forceDetail?: boolean;
}) {
  const geometries = useGeometries();
  const detail = useEditorPreferences((s) => s.detail);
  const kit = kitAsset(item.piece);
  const bounds = localBounds(item),
    center = bounds.min.map(
      (n, i) => (n + bounds.max[i]) / 2 / item.size[i],
    ) as [number, number, number],
    extent = bounds.min.map((n, i) => (bounds.max[i] - n) / item.size[i]) as [
      number,
      number,
      number,
    ];
  const parts = item.parts
        .filter(
          (part) => !collisionOnly || (item.solid && part.solid !== false),
        )
        .map((part, i) => (
          <mesh
            key={i}
            geometry={geometries[part.shape]}
            position={part.position}
            scale={part.size}
          >
            <meshStandardMaterial
              color={ghost ? "#60e0bd" : (part.color ?? item.color)}
              roughness={0.9}
              metalness={0.025}
              transparent={ghost}
              opacity={ghost ? 0.48 : 1}
              depthWrite={!ghost}
              wireframe={wireframe}
            />
          </mesh>
        ));
  return (
    <>
      {kit && <KitMesh item={item} asset={kit} ghost={ghost} collisionOnly={collisionOnly} wireframe={wireframe} forceDetail={forceDetail}/>}
      {item.vehicle && (
        <VehicleMesh
          item={item}
          ghost={ghost}
          collisionOnly={collisionOnly}
          forceDetail={forceDetail}
        />
      )}
      {item.model && (
        <ModelMesh
          item={item}
          ghost={ghost}
          wireframe={wireframe}
          collisionOnly={collisionOnly}
          proxy={!forceDetail && detail === "low"}
        />
      )}
      {item.road && (
        <RoadModel
          item={item}
          collisionOnly={collisionOnly}
          wireframe={wireframe}
          ghost={ghost}
        />
      )}
      {item.piece==="coastal-road" && !wireframe && !collisionOnly ? <HarborStreet item={item}/> :
       usesGarage(item.piece) && !wireframe && !collisionOnly ? <ModelMesh item={garageVisual(item)} ghost={ghost}/> :
       item.piece==="coastal-building" && !wireframe && !collisionOnly && !ghost ?
       <HarborBuildings items={[{...item,position:[0,0,0],size:[1,1,1],yaw:0}]} fallback={parts}/> :
       item.piece===CARRIER && !collisionOnly && !wireframe && !ghost ? <BigEDocked fallback={<>{parts}</>}/> : streetProp(item.piece) && !collisionOnly && !wireframe && !ghost ?
        <StreetPropPreview piece={item.piece} fallback={parts}/> : parts}
      {selected && (
        <mesh position={center} scale={extent} renderOrder={10}>
          <boxGeometry args={[1.025, 1.025, 1.025]} />
          <meshBasicMaterial
            color="#55caff"
            wireframe
            depthTest={false}
            transparent
            opacity={0.8}
          />
        </mesh>
      )}
    </>
  );
}
