/** Factory tank loadout metadata. Planned mounts never become wire weapon IDs. */
export const TANK_SECONDARIES = [
 {id:'roof-mg',label:'ROOF MG',weapon:'coax',rangeMeters:800,planned:false},
 {id:'forward-mg',label:'COAX MG',weapon:'basket',rangeMeters:200,planned:false},
] as const;
export type TankSecondary=typeof TANK_SECONDARIES[number]['id'];
export type TankFireSlot='primary'|'secondary';
export type TankFireSource='keyboard'|'gamepad'|'pointer';
const UNAVAILABLE_SECONDARY={id:'unavailable',label:'SECONDARY UNAVAILABLE',weapon:null,rangeMeters:null,planned:true} as const;
export const secondaryDefinition=(id:TankSecondary)=>TANK_SECONDARIES.find(item=>item.id===id)??UNAVAILABLE_SECONDARY;
export const TANK_FIRE_SOURCES=['keyboard','gamepad','pointer'] as const;
const emptySource=()=>({primary:false,secondary:false,primaryPulseUntil:0,secondaryPulseUntil:0});
export const createTankFireInputs=()=>({keyboard:emptySource(),gamepad:emptySource(),pointer:emptySource()});
export type TankFireInputs=ReturnType<typeof createTankFireInputs>;
export function clearTankFireInputs(inputs:TankFireInputs,source?:TankFireSource){
 for(const name of source?[source]:TANK_FIRE_SOURCES){
  inputs[name].primary=false;inputs[name].secondary=false;
  inputs[name].primaryPulseUntil=0;inputs[name].secondaryPulseUntil=0;
 }
}
/** This only chooses a request for the existing single weapon wire channel.
 * Server reloads remain authoritative. When both slots are held, a ready cannon
 * gets the next packet, then the MG uses packets during its independent reload. */
export function sampleTankFire(inputs:TankFireInputs,secondary:TankSecondary,now:number,cannonReload:number|undefined){
 const primary=TANK_FIRE_SOURCES.some(source=>inputs[source].primary||now<inputs[source].primaryPulseUntil);
 const secondaryRequested=TANK_FIRE_SOURCES.some(source=>inputs[source].secondary||now<inputs[source].secondaryPulseUntil);
 const secondaryLive=secondaryDefinition(secondary).weapon!==null&&secondaryRequested;
 if(primary&&(!secondaryLive||cannonReload===undefined||cannonReload<=0))return {weapon:'cannon' as const,fire:true};
 if(secondaryLive)return {weapon:secondaryDefinition(secondary).weapon!,fire:true};
 return {weapon:'cannon' as const,fire:false};
}
