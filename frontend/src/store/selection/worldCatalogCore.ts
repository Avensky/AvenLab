/** Manifest normalization shared by the world picker and headless tests. */
export type MapDefinition = {id:string;name:string;desc:string};
// Zustand selectors must return the same reference while their source state
// has not changed. Constructing this fallback inline in getSelectedMap() made
// the first mode-selection render spin until React hit maximum update depth.
export const NO_INSTALLED_MAP: Readonly<MapDefinition> = Object.freeze({
  id:'', name:'No installed worlds', desc:'No installed environments are available.',
});
export function reuseMapDefinitions(current:MapDefinition[],next:MapDefinition[]):MapDefinition[]{
  return current.length===next.length&&current.every((map,index)=>
    map.id===next[index].id&&map.name===next[index].name&&map.desc===next[index].desc)
    ? current : next;
}
type ManifestEntry = {map_id?:unknown;name?:unknown;desc?:unknown;file?:unknown};

export function installedMapDefinitions(manifest:unknown):MapDefinition[]{
  const maps=(manifest as {maps?:unknown}|null)?.maps;
  if(!Array.isArray(maps))throw Error('Invalid installed-world manifest');
  const seen=new Set<string>();
  return maps.flatMap((raw):MapDefinition[]=>{
    if(!raw||typeof raw!=='object')return [];
    const entry=raw as ManifestEntry;
    const id=entry.map_id;
    if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,96}$/.test(id)||
       entry.file!==`${id}_colliders.json`||seen.has(id))return [];
    seen.add(id);
    return [{id,name:typeof entry.name==='string'?entry.name:id,
      desc:typeof entry.desc==='string'?entry.desc:'Installed server environment'}];
  });
}

export function visibleMapDefinitions(installed:MapDefinition[],serverIds:string[]|null){
  return serverIds===null?installed:installed.filter(map=>serverIds.includes(map.id));
}
