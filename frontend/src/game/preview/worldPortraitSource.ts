/** Selection shows the same saved local layout the editor restores next time. */
export function savedWorldPortrait(mapId:string,storage:Pick<Storage,'getItem'>):unknown|null{
 for(const [prefix,layout] of [['avenlab-layout-v1',true],['avenlab-world-builder-v1',false]] as const){
  try{
   const text=storage.getItem(`${prefix}:${mapId}`);if(!text)continue;
   const doc=JSON.parse(text);
   if(doc.map_id!==mapId)continue;
   if(layout&&Array.isArray(doc.objects))return {authored_layout:doc};
   if(!layout&&(Array.isArray(doc.roads)||doc.authored_layout))return doc;
  }catch{/* A corrupt or inaccessible draft cannot prevent installed previews. */}
 }
 return null;
}
