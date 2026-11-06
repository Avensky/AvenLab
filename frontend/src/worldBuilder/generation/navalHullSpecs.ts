import type {LayoutPart,V3} from '../document/layoutDocument.ts';

/** Source mesh bounds from fleet/manifest.json. The physical ship uses an
 * intentionally simpler lower-hull proxy than its textured visual/antennas. */
export const LOUISIANA_SIZE:V3=[36.67,40.1,188.08];
export const LOUISIANA_HULL:[number,number,number]=[33,11,178];
const part=(y:number,z:number,size:V3):LayoutPart=>({
  shape:'box',position:[0,y/LOUISIANA_SIZE[1],z/LOUISIANA_SIZE[2]],
  size:[size[0]/LOUISIANA_SIZE[0],size[1]/LOUISIANA_SIZE[1],size[2]/LOUISIANA_SIZE[2]],
});
export const louisianaCollisionParts:LayoutPart[]=[
  // No collider on the antenna tops: height is visual only.
  part(-3,0,[33,11,150]),part(-3,-80,[21,9,24]),part(-3,80,[21,9,24]),
  part(7,-49,[25,.9,45]),part(7,47,[26,.9,45]),
  part(7,0,[31,.9,54]),
  part(15,0,[16,13,35]),
];
