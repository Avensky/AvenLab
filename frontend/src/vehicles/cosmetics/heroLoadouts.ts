import { create } from "zustand";
import { normalizePaintFinish, type PaintFinish } from "./paintFinishes.ts";
export type HeroAppearance = {body:string;finish:PaintFinish;metallic:number;seats:"factory"|"black"|"red";skin:string};
export const FACTORY_APPEARANCE: HeroAppearance = {body:"factory",finish:"gloss",metallic:.42,seats:"factory",skin:"factory"};
export function normalizeHeroAppearance(value?:Partial<HeroAppearance>|null):HeroAppearance {
 const metallic=typeof value?.metallic==="number"&&Number.isFinite(value.metallic)?Math.max(0,Math.min(1,value.metallic)):FACTORY_APPEARANCE.metallic;
 return {body:typeof value?.body==="string"?value.body:FACTORY_APPEARANCE.body,
  finish:normalizePaintFinish(value?.finish),metallic,
  seats:value?.seats==="black"||value?.seats==="red"?value.seats:"factory",
  skin:typeof value?.skin==="string"?value.skin:FACTORY_APPEARANCE.skin};
}
/** Account-scoped server cache, never a device-wide skin preference. Profile
 * adoption and sign-out clear drafts so another player cannot inherit paint. */
export const useHeroLoadouts = create<{
 ownerId:string|null;defaultHero:string;loadouts:Record<string,HeroAppearance>;
 draft:{vehicle:string;appearance:HeroAppearance}|null;
 adopt:(ownerId:string|null,defaultHero?:string,loadouts?:Record<string,HeroAppearance>)=>void;
 save:(hero:string,vehicle:string,appearance:HeroAppearance,makeDefault?:boolean)=>void;
}>(set=>({ownerId:null,defaultHero:"brz",loadouts:{},draft:null,
 adopt:(ownerId,defaultHero="brz",loadouts={})=>set(s=>({ownerId,defaultHero,loadouts:Object.fromEntries(Object.entries(loadouts).map(([vehicle,appearance])=>[vehicle,normalizeHeroAppearance(appearance)])),...(s.ownerId!==ownerId?{draft:null}:{})})),
 save:(hero,vehicle,appearance,makeDefault=true)=>set(s=>({...(makeDefault?{defaultHero:hero}:{}),loadouts:{...s.loadouts,[vehicle]:normalizeHeroAppearance(appearance)}})),
}));
