import {create} from 'zustand';
import {persist} from 'zustand/middleware';
export const useTireEffectsSettings=create(persist<{marks:boolean;volume:number;setMarks:(value:boolean)=>void;setVolume:(value:number)=>void}>(set=>({
 marks:true,volume:.35,setMarks:marks=>set({marks}),setVolume:volume=>set({volume:Math.min(1,Math.max(0,Number.isFinite(volume)?volume:0))}),
}),{name:'avenlab-tire-effects-v1',version:1}));
