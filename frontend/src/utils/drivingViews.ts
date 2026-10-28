export type DrivingView='DEFAULT'|'FIRST_PERSON'|'BIRDS_EYE';
export const DRIVING_VIEWS:DrivingView[]=['DEFAULT','FIRST_PERSON','BIRDS_EYE'];
export function nextDrivingView(current:string):DrivingView {return DRIVING_VIEWS[(DRIVING_VIEWS.indexOf(current as DrivingView)+1)%DRIVING_VIEWS.length];}
export function specialCameraPreset(mode:string,vehicle:string|null) {
 if(mode==='BIRDS_EYE')return {offset:[0,36,-.01] as [number,number,number],targetOffset:[0,0,0] as [number,number,number],positionSpeed:7,targetSpeed:10,worldAligned:true};
 const tank=vehicle?.toLowerCase().includes('tank');
 return {offset:(tank?[-.5,1.5,.3]:[-.32,.4,.25]) as [number,number,number],targetOffset:(tank?[-.5,1.5,30]:[-.32,.4,30]) as [number,number,number],positionSpeed:12,targetSpeed:12,worldAligned:false};
}
