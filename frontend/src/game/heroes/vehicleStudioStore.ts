import {create} from "zustand";

export type VehicleStudioPart="door-left"|"door-right"|"hood"|"trunk"|"headlights";
export type VehicleStudioPartState=Record<VehicleStudioPart,boolean>;
const CLOSED:VehicleStudioPartState={"door-left":false,"door-right":false,hood:false,trunk:false,headlights:false};
export const useVehicleStudioStore=create<{parts:VehicleStudioPartState;availableVehicle:string|null;availableParts:VehicleStudioPart[];setPart:(part:VehicleStudioPart,open:boolean)=>void;setAvailable:(vehicle:string|null,parts?:VehicleStudioPart[])=>void;closeParts:()=>void;reset:()=>void}>(set=>({
 parts:CLOSED,availableVehicle:null,availableParts:[],
 setPart:(part,open)=>set(state=>state.parts[part]===open?state:{parts:{...state.parts,[part]:open}}),
 setAvailable:(vehicle,parts=[])=>set({availableVehicle:vehicle,availableParts:parts}),
 closeParts:()=>set({parts:CLOSED}),
 reset:()=>set({parts:CLOSED,availableVehicle:null,availableParts:[]}),
}));
