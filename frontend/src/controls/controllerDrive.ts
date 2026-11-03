/** Automatic Drive uses the standard brake-to-reverse trigger flow. Rust owns
 * the near-stop direction interlock; explicit R/N/P/manual gears stay explicit. */
export function controllerDrive(accelerator:number,leftTrigger:number,legacyThrottle:number,automaticDrive:boolean){
  if(automaticDrive&&accelerator===0&&legacyThrottle===0&&leftTrigger>0){
    return {throttle:-leftTrigger,brake:0};
  }
  return {throttle:accelerator||legacyThrottle,brake:leftTrigger};
}
