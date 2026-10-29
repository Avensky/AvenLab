export type ModelRole='floor'|'walls'|'roof'|'floor-detail'|'roof-detail'|'details'|'omit';
// Explicit structural membership. Decorative fixtures never inflate a room's
// collider; the same classification is used by extraction and rendering.
export function garageRole(node:string,centerY:number,normalY:number):ModelRole {
 node=node.replace(/[^a-zA-Z0-9]/g,'').toLowerCase();
 if(node==='44')return 'omit';
 if(node==='planepiste')return 'floor';
 if(node==='basefull'||node==='basesol')return Math.abs(normalY)>.7&&centerY<.3?'floor':'walls';
 if(node==='03piler')return 'walls';
 if(node==='planeplane')return 'roof';
 if(['solcube','rbtour','rbtour001'].includes(node))return 'floor-detail';
 if(['fond01','fond01001','semimurs','toitgrille'].includes(node))return 'roof-detail';
 return 'details';
}

const modules=new Set(['44','planepiste','basefull','basesol','03piler','planeplane','solcube','rbtour','rbtour001','fond01','fond01001','semimurs','toitgrille']);
export const isGarageModule=(name:string)=>modules.has(name.replace(/[^a-zA-Z0-9]/g,'').toLowerCase());
