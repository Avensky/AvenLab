import {create} from "zustand";
import {DEFAULT_WINDOW_TONE,type WindowTone} from "../preview/windowTones";

export type VehicleStudioPart="door-left"|"door-right"|"hood"|"trunk"|"headlights";
export type VehicleStudioPartState=Record<VehicleStudioPart,boolean>;
export type VehicleStudioTab="abilities"|"performance"|"paint"|"body"|"lighting"|"studio";
export type MarineLamp="navigation"|"searchlights";
const CLOSED:VehicleStudioPartState={"door-left":false,"door-right":false,hood:false,trunk:false,headlights:false};
const DARK={navigation:false,searchlights:false};
export const useVehicleStudioStore=create<{parts:VehicleStudioPartState;availableVehicle:string|null;availableParts:VehicleStudioPart[];activeTab:VehicleStudioTab|null;glassStyle:WindowTone;marineLights:Record<MarineLamp,boolean>;transmissions:Record<string,"manual"|"automatic">;setActiveTab:(tab:VehicleStudioTab|null)=>void;setGlassStyle:(style:WindowTone)=>void;toggleMarineLamp:(lamp:MarineLamp)=>void;setTransmission:(vehicle:string,mode:"manual"|"automatic")=>void;setPart:(part:VehicleStudioPart,open:boolean)=>void;setAvailable:(vehicle:string|null,parts?:VehicleStudioPart[])=>void;closeParts:()=>void;reset:()=>void}>(set=>({
 parts:CLOSED,availableVehicle:null,availableParts:[],activeTab:null,glassStyle:DEFAULT_WINDOW_TONE,marineLights:DARK,transmissions:{},
 setActiveTab:activeTab=>set(state=>state.activeTab===activeTab?state:{activeTab}),
 setGlassStyle:glassStyle=>set(state=>state.glassStyle===glassStyle?state:{glassStyle}),
 toggleMarineLamp:lamp=>set(state=>({marineLights:{...state.marineLights,[lamp]:!state.marineLights[lamp]}})),
 setTransmission:(vehicle,mode)=>set(state=>state.transmissions[vehicle]===mode?state:{transmissions:{...state.transmissions,[vehicle]:mode}}),
 setPart:(part,open)=>set(state=>state.parts[part]===open?state:{parts:{...state.parts,[part]:open}}),
 setAvailable:(vehicle,parts=[])=>set({availableVehicle:vehicle,availableParts:parts}),
 closeParts:()=>set({parts:CLOSED,marineLights:DARK}),
 reset:()=>set({parts:CLOSED,marineLights:DARK,availableVehicle:null,availableParts:[]}),
}));
