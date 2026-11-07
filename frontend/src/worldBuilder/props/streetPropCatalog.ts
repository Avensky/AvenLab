import measured from './harborStreetProps.json' with {type:'json'};
import type { Piece } from "../document/layoutDocument";

type StreetProp = Piece & { node: string; tip?:number[] };
const solidBody = [{ shape: "box" as const, position: [0,.5,0] as [number,number,number], size: [1,1,1] as [number,number,number] }];

const definitions: (Omit<StreetProp, "category" | "parts"> & { parts?: Piece["parts"] })[] = [
  { id:"downtown-cone", node:"Downtown_Cone", label:"Traffic cone", size:[.329,.72,.329], color:"#e88042", description:"Decorative work-zone marker", solid:false },
  { id:"downtown-metal-barrier", node:"Downtown_MetalBarrier", label:"Metal crowd barrier", size:[1.894,1,.479], color:"#88939c", description:"Individually placeable metal roadblock" },
  { id:"downtown-plastic-barrier", node:"Downtown_PlasticBarrier", label:"Plastic roadblock", size:[1.968,1,.762], color:"#c06e45", description:"Individually placeable construction barrier" },
  { id:"downtown-signal-post", node:"Downtown_SignalPost", label:"Traffic signal post", size:[2.358,7,.309], color:"#6d7679", description:"Curbside pole and arm; attach the signal head separately",
    parts:[{shape:"box",position:[-.443,.49,0],size:[.115,.98,.89]}] },
  { id:"downtown-signal-head", node:"Downtown_SignalHead", label:"Traffic signal head", size:[.239,.74,.332], color:"#54595e", description:"Separate fixture for intersections", solid:false },
];
export const streetProps: StreetProp[] = definitions.map(prop => ({category:"city-props",collection:"Downtown Object Props",source:"/models/world/props/DowntownObj_Props.glb",parts:solidBody,...prop}));
const harborNames:Record<string,[string,string]> = {
  FoodCart:['cart','Hot dog cart'], CafeTable:['table','Sidewalk café table'], CafeChair:['chair','Café chair'],
  Bin:['bin','Street bin'], NewsBox:['news','Newspaper box'], AlleyBags:['bags','Alley trash bags'],
  LaneSign:['lane','Lane closure sign'],RoadSign:['closed','Road closed sign'],StreetLamp:['lamp','Harbor streetlight'],
};
for(const asset of measured){
  const [id,label]=harborNames[asset.node];
  streetProps.push({id:'harbor-'+id,label,node:asset.node,category:'city-props',collection:'Harbor Street Props',source:'/models/world/harbor-street-props.glb',
    size:asset.size as Piece['size'],color:'#88959a',description:label,solid:!['bags','chair','lane','closed'].includes(id),
    tip:asset.tip,parts:id==='lamp'?[{shape:'box',position:[0,.5,.43],size:[.74,1,.10]}]:solidBody});
}
const byPiece = new Map(streetProps.map(prop => [prop.id,prop]));
export const streetProp = (piece:string) => byPiece.get(piece);
