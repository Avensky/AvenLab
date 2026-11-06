// Initial snapshot for offline previews only. The live list comes from the
// validated, generated /world-builder/catalog.json manifest at runtime.
import { create } from "zustand";
import { useSocialStore } from "../social/socialStore";
import maps from "./generated/maps.json";
import {installedMapDefinitions,visibleMapDefinitions,reuseMapDefinitions,type MapDefinition} from "./worldCatalogCore";
export type {MapDefinition} from "./worldCatalogCore";
export const mapCatalog: MapDefinition[] = maps;

type WorldCatalogState = {
  installed: MapDefinition[];
  maps: MapDefinition[];
  ready: boolean;
  status: string;
};
const serverMaps = () => useSocialStore.getState().view?.maps ?? null;
const available = (installed: MapDefinition[]) => visibleMapDefinitions(installed,serverMaps());
export const useWorldCatalog = create<WorldCatalogState>(() => ({
  installed: [], maps: [], ready: false, status: "Discovering installed worlds…",
}));

// The Rust social server also scans its installed map files. Once connected,
// expose only worlds that both the frontend and the active server can load.
useSocialStore.subscribe((state, previous) => {
  if(state.view?.maps === previous.view?.maps) return;
  useWorldCatalog.setState(current => {
    const maps=reuseMapDefinitions(current.maps,available(current.installed));
    return maps===current.maps?current:{maps};
  });
});

let refreshPending: Promise<void> | null = null;
export function refreshInstalledWorlds(): Promise<void> {
  if(refreshPending) return refreshPending;
  refreshPending=(async()=>{
    try {
      const response=await fetch(`/world-builder/catalog.json?t=${Date.now()}`,{cache:"no-store"});
      if(!response.ok)throw Error(`World catalog unavailable (${response.status})`);
      const installed=installedMapDefinitions(await response.json());
      useWorldCatalog.setState(current=>{
        const stableInstalled=reuseMapDefinitions(current.installed,installed);
        return {installed:stableInstalled,maps:reuseMapDefinitions(current.maps,available(stableInstalled)),ready:true,
          status:installed.length?`${installed.length} installed world(s) found`:`No installed worlds found`};
      });
    }catch(error){
      useWorldCatalog.setState({installed:[],maps:[],ready:true,
        status:error instanceof Error?error.message:"Could not discover installed worlds"});
    }
  })().finally(()=>{refreshPending=null;});
  return refreshPending;
}
