declare module 'virtual:road-kit-bundle' {
 const bundle:{assets:Record<'road_narrow'|'road_wide'|'intersection',{base64:string;sha256:string}>;decoder:{wrapper:string;wasm:string}};
 export default bundle;
}
