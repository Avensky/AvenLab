import { create } from "zustand";
import { persist } from "zustand/middleware";
export type HeroAppearance = {body:string;finish:"factory"|"frs"|"soft";seats:"factory"|"black"|"red";skin:string};
export const FACTORY_APPEARANCE: HeroAppearance = {body:"factory",finish:"frs",seats:"factory",skin:"factory"};
/** Cached saved loadouts are presentation preferences; server validates equips. */
export const useHeroLoadouts = create<{defaultHero:string;loadouts:Record<string,HeroAppearance>;draft:{vehicle:string;appearance:HeroAppearance}|null;save:(hero:string,vehicle:string,appearance:HeroAppearance)=>void}>()(persist(set=>({
 defaultHero:"brz",loadouts:{},draft:null,save:(hero,vehicle,appearance)=>set(s=>({defaultHero:hero,loadouts:{...s.loadouts,[vehicle]:appearance}})),
}),{name:"avenlab-hero-loadouts-v1",partialize:s=>({defaultHero:s.defaultHero,loadouts:s.loadouts})}));
