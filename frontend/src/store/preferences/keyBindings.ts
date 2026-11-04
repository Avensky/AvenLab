export const DEFAULT_BINDINGS = {
  forward: "KeyW",
  reverse: "KeyS",
  left: "KeyA",
  right: "KeyD",
  brake: "Space",
  handbrake: "KeyB",
  fire:"KeyF",
  secondaryFire:"KeyI",
  nextWeapon:"KeyV",
  previousWeapon:"KeyG",
  scope:"KeyO",
  healthBars:"KeyJ",
  revive:"KeyU",
  barrier:"KeyP",
};
export type BindingAction = keyof typeof DEFAULT_BINDINGS;
export const RESERVED_KEYS = new Set([
  "F2",
  "F3",
  "F4",
  "F8",
  "F9",
  "Escape",
  "Enter",
  "Tab",
  "Backquote",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyE",
  "KeyL",
  "KeyZ",
  "KeyX",
  "KeyH",
  "KeyQ",
  "KeyT",
  "KeyC",
  "KeyV",
  "KeyY",
  "KeyM",
  "KeyN",
  "KeyR",
  "ShiftLeft",
  "ShiftRight",
]);


export const DRIVING_ACTIONS=['forward','reverse','left','right','brake','handbrake'] as const;
export function isBindingKey(action:BindingAction,code:string){
 return /^(Key[A-Z]|Digit[0-9]|Space)$/.test(code)&&(!RESERVED_KEYS.has(code)||(action==='nextWeapon'&&code==='KeyV'));
}
/** Preserve six-key driving saves, then add collision-free combat defaults. */
export function sanitizeBindings(value:unknown):Record<BindingAction,string>{
 const raw=(value&&typeof value==='object'?value:{}) as Record<string,unknown>;
 const driving=DRIVING_ACTIONS.map(a=>raw[a]??DEFAULT_BINDINGS[a]);
 const valid=new Set(driving).size===DRIVING_ACTIONS.length&&DRIVING_ACTIONS.every((a,i)=>typeof driving[i]==='string'&&isBindingKey(a,driving[i] as string));
 const result={} as Record<BindingAction,string>;const used=new Set<string>();
 for(const a of DRIVING_ACTIONS){result[a]=valid?raw[a] as string??DEFAULT_BINDINGS[a]:DEFAULT_BINDINGS[a];used.add(result[a]);}
 for(const a of ['fire','nextWeapon','previousWeapon','scope','secondaryFire','healthBars','revive','barrier'] as const){
  const candidates=[raw[a],DEFAULT_BINDINGS[a],'KeyI','KeyJ','KeyK','Digit2','Digit4','Digit5',...Array.from({length:26},(_,i)=>`Key${String.fromCharCode(65+i)}`),...Array.from({length:10},(_,i)=>`Digit${i}`)];
  const code=candidates.find(c=>typeof c==='string'&&isBindingKey(a,c)&&!used.has(c)) as string;
  result[a]=code;used.add(code);
 }
 return result;
}
export function combatKeyLabel(code:string){return code==='Space'?'SPACE':code.replace(/^Key|^Digit/,'');}
