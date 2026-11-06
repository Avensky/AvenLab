import type {LayoutObject} from '../document/layoutDocument.ts';

export const NAVAL_WAYPOINT='naval-route-waypoint';
export type NavalWaypoint={id:string;position:[number,number,number];heading:number};
/** Authoring order is the route order. Export uses the same document array;
 * future server patrols can read this manifest without a separate hand list. */
export function recordedNavalRoute(objects:readonly LayoutObject[]):NavalWaypoint[]{
  return objects.filter(item=>item.piece===NAVAL_WAYPOINT).map(item=>({
    id:item.id,position:[...item.position],heading:item.yaw,
  }));
}
