import catalog from './generated/assetCatalog.json' with {type:'json'};

export type VehicleAssetId=keyof typeof catalog.assets;
export type VehicleLod='near'|'medium'|'far';
export type VehicleAssetGroup=keyof typeof catalog.groups;
export type VehicleAsset={group:VehicleAssetGroup;subgroup:string;model:string;lods:Partial<Record<VehicleLod,string>>;variants:Record<string,string>};
export const VEHICLE_ASSETS=catalog.assets as Record<VehicleAssetId,VehicleAsset>;
export const VEHICLE_ASSET_GROUPS=catalog.groups;
export function vehicleAssetDefinition(id:string):VehicleAsset{
 if(!Object.hasOwn(VEHICLE_ASSETS,id))throw Error(`Unknown vehicle asset: ${id}`);
 return VEHICLE_ASSETS[id as VehicleAssetId];
}
export const vehicleModelUrl=(id:string)=>vehicleAssetDefinition(id).model;
/** Models with no reduced tier keep their authored model; never invent a URL. */
export const vehicleLodUrl=(id:string,tier:VehicleLod)=>{
 const asset=vehicleAssetDefinition(id);return asset.lods[tier]??asset.model;
};
export function vehicleVariantUrl(id:string,variant:string){
 const asset=vehicleAssetDefinition(id);
 if(!Object.hasOwn(asset.variants,variant))throw Error(`Unknown vehicle variant: ${id}/${variant}`);
 return asset.variants[variant];
}
