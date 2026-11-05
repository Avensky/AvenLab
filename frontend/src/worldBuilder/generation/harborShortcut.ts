import { pieceById, type LayoutObject } from '../document/layoutDocument.ts';

import {glassDamage} from '../document/libraryCatalog.ts';

// Approach from the south (-Z), break the full-width storefront, then climb
// through the opposite face and jump the cross street onto the lower roof.
export function fitHarborShortcut(objects:LayoutObject[], side:number) {
  const x=side*119;
  const launch=objects.find(o=>o.position[0]===x && o.position[2]===-112 && o.piece==='coastal-building');
  const landing=objects.find(o=>o.position[0]===x && o.position[2]===-74 && o.piece==='coastal-building');
  if (!launch || !landing) return;
  const gallery=pieceById('launch-gallery')!;
  Object.assign(launch,{piece:gallery.id,name:gallery.label,yaw:180,size:[...gallery.size],parts:structuredClone(gallery.parts)});
  // The lower roof extends over the sidewalk. Its lip is one metre short of the roadway.
  landing.position[2]=-76;
  landing.size=[15,2.4,26];
  landing.name='Cross-street landing roof';
  const pane=pieceById('breakaway-glass')!;
  const bank=side<0 ? 'west' : 'east';
  objects.push({id:'shortcut-glass-'+bank,piece:pane.id,name:pane.label,
    position:[x,.08,-123],size:[13.8,4.2,.10],yaw:0,color:pane.color,
    locked:false,solid:true,parts:structuredClone(pane.parts),destruction:{...glassDamage}});
}
