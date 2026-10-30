export type VehicleAssetId = 'ae86' | 'brz' | 'camaro' | 'supra' | 'tank';
export type VehiclePlacement = {asset: VehicleAssetId; lod: 'auto' | 'proxy' | 'full'};
export type VehicleAsset = {id: VehicleAssetId; label: string; url: string; size: [number,number,number]; sourceYaw: number; color: string};
// Background props use their complete imported static pose, without any player
// stores, wheel animation, audio, lights or suspension updates.
export const VEHICLE_ASSETS: VehicleAsset[] = [
  {id:'ae86',label:'AE86',url:'/models/vehicles/ae86.glb',size:[1.8,1.35,4.3],sourceYaw:0,color:'#d7e1e9'},
  {id:'brz',label:'BRZ',url:'/models/vehicles/brz.glb',size:[1.9,1.35,4.3],sourceYaw:0,color:'#5f9fd8'},
  {id:'camaro',label:'Camaro',url:'/models/vehicles/camaro.glb',size:[2,1.4,4.8],sourceYaw:0,color:'#e6b55c'},
  {id:'supra',label:'Supra',url:'/models/vehicles/supra_2020.glb',size:[2.03,1.29,4.51],sourceYaw:Math.PI,color:'#c84c5e'},
  {id:'tank',label:'Tank',url:'/models/vehicles/tank.glb',size:[3.6,3,7.5],sourceYaw:0,color:'#7c9273'},
];
export const vehicleAsset = (id: string) => VEHICLE_ASSETS.find(v=>v.id===id);
export function validateVehicle(value: unknown): asserts value is VehiclePlacement {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid background vehicle');
  const v=value as VehiclePlacement;
  if(!vehicleAsset(v.asset)||!['auto','proxy','full'].includes(v.lod))throw Error('Unknown background vehicle or detail mode');
}
export type DetailPreference = 'auto' | 'low' | 'high';
// Bounded near-model set plus hysteresis: a street of parked cars never loads
// every high-detail asset on its first frame. The remaining cars are instanced.
export function vehicleDetailIds(items: {id:string;position:[number,number,number];vehicle?:VehiclePlacement}[], camera:[number,number,number], quality:DetailPreference, previous:ReadonlySet<string> = new Set()) {
  if(quality==='low')return [];
  const range=quality==='high'?180:85,budget=quality==='high'?12:6;
  return items.filter(o=>o.vehicle&&o.vehicle.lod!=='proxy').map(o=>({id:o.id,distance:Math.hypot(...o.position.map((v,i)=>v-camera[i])),range:o.vehicle!.lod==='full'?300:range})).filter(o=>o.distance<o.range*(previous.has(o.id)?1.2:1)).sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id)).slice(0,budget).map(o=>o.id);
}
