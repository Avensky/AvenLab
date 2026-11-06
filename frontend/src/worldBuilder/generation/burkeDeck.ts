import type {LayoutPart,V3} from "../document/layoutDocument.ts";

/** Dimensions measured from burke-lod0.glb, after metric normalization.
 * The model's -Y keel in glTF is lifted to local y=0 in the prefab renderer.
 * The bow is rotated to point toward local -Z (AvenLab forward).
 */
export const burkeSize:V3=[21.3039,55.9796,154];
export const burkeKeelY=-16.4933;
export const burkeWaterlineY=-7;
export const burkeHarborKeel=-17.5; // ocean surface -8, approx 9.5 m above keel

/** Boxes are conservative navigation surfaces, not watertight hull geometry.
 * Positions/sizes are normalized to the World Builder piece's editable size.
 * Levels were sampled from the uploaded GLB's upward-facing polygons.
 */
function box(x:number,top:number,z:number,width:number,height:number,length:number):LayoutPart {
  return {shape:"box",position:[x/burkeSize[0],(top-height/2-burkeKeelY)/burkeSize[1],z/burkeSize[2]],
    size:[width/burkeSize[0],height/burkeSize[1],length/burkeSize[2]]};
}
export const burkeCollisionParts:LayoutPart[]=[
  // Underwater hull proxies stop vehicles and other rigid bodies passing through.
  box(0,-5,0,16,10,104),
  box(0,-5,-60,10,9,30),
  box(0,-5,60,13,9,28),
  // Forward decks; the bow narrows and rises toward the gun.
  box(0,1.3,-55,11.5,.65,30),
  box(0,-.5,-29,13,.65,20),
  // Side passages leave the bridge/superstructure blocked in the center.
  box(-8,-1.1,1,2.3,.65,32),
  box(8,-1.1,1,2.3,.65,32),
  box(0,2,34,13,.65,23),
  box(0,-2.85,62,12,.65,23), // helicopter landing area
  // Bridgehouse. Deck colliders must not accidentally make its interior open.
  box(0,11,-7,11,12,29),
];
