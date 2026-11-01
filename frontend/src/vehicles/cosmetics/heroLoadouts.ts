import { create } from "zustand";
export type HeroAppearance = {body:string;finish:"factory"|"frs"|"soft";seats:"factory"|"black"|"red";skin:string};
export const FACTORY_APPEARANCE: HeroAppearance = {body:"factory",finish:"frs",seats:"factory",skin:"factory"};
/** Account-scoped server cache, never a device-wide skin preference. Profile
 * adoption and sign-out clear drafts so another player cannot inherit paint. */
export const useHeroLoadouts = create<{
 ownerId:string|null;defaultHero:string;loadouts:Record<string,HeroAppearance>;
 draft:{vehicle:string;appearance:HeroAppearance}|null;
 adopt:(ownerId:string|null,defaultHero?:string,loadouts?:Record<string,HeroAppearance>)=>void;
 save:(hero:string,vehicle:string,appearance:HeroAppearance,makeDefault?:boolean)=>void;
}>(set=>({ownerId:null,defaultHero:"brz",loadouts:{},draft:null,
 adopt:(ownerId,defaultHero="brz",loadouts={})=>set(s=>({ownerId,defaultHero,loadouts,...(s.ownerId!==ownerId?{draft:null}:{})})),
 save:(hero,vehicle,appearance,makeDefault=true)=>set(s=>({...(makeDefault?{defaultHero:hero}:{}),loadouts:{...s.loadouts,[vehicle]:appearance}})),
}));
