import {create} from "zustand";

export type VehicleStudioPart="door-left"|"door-right"|"hood"|"trunk"|"headlights";
export type VehicleStudioPartState=Record<VehicleStudioPart,boolean>;
export type VehicleStudioTab="abilities"|"performance"|"paint"|"body"|"lighting"|"studio";
export type VehicleGlassStyle="clear"|"light-smoke"|"dark-smoke";
const CLOSED:VehicleStudioPartState={"door-left":false,"door-right":false,hood:false,trunk:false,headlights:false};
export const useVehicleStudioStore=create<{parts:VehicleStudioPartState;availableVehicle:string|null;availableParts:VehicleStudioPart[];activeTab:VehicleStudioTab|null;glassStyle:VehicleGlassStyle;transmissions:Record<string,"manual"|"automatic">;setActiveTab:(tab:VehicleStudioTab|null)=>void;setGlassStyle:(style:VehicleGlassStyle)=>void;setTransmission:(vehicle:string,mode:"manual"|"automatic")=>void;setPart:(part:VehicleStudioPart,open:boolean)=>void;setAvailable:(vehicle:string|null,parts?:VehicleStudioPart[])=>void;closeParts:()=>void;reset:()=>void}>(set=>({
 parts:CLOSED,availableVehicle:null,availableParts:[],activeTab:null,glassStyle:"light-smoke",transmissions:{},
 setActiveTab:activeTab=>set(state=>state.activeTab===activeTab?state:{activeTab}),
 setGlassStyle:glassStyle=>set(state=>state.glassStyle===glassStyle?state:{glassStyle}),
 setTransmission:(vehicle,mode)=>set(state=>state.transmissions[vehicle]===mode?state:{transmissions:{...state.transmissions,[vehicle]:mode}}),
 setPart:(part,open)=>set(state=>state.parts[part]===open?state:{parts:{...state.parts,[part]:open}}),
 setAvailable:(vehicle,parts=[])=>set({availableVehicle:vehicle,availableParts:parts}),
 closeParts:()=>set({parts:CLOSED}),
 reset:()=>set({parts:CLOSED,availableVehicle:null,availableParts:[]}),
}));
