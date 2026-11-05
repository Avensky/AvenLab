import positions from './lampPositions.json';
import {vehicleAsset} from '../../worldBuilder/vehicles/vehicleCatalog';
import {Mesh,MeshBasicMaterial,SphereGeometry,SpotLight,type Object3D} from 'three';
import {VehicleFlags,hasFlag} from '../../store/input/protocol/inputMasks';
import {applyHeadlightBeam} from './headlightBeam';

/** Lights mount on authored sockets, so avatar/camera tools can use the same
 * model without adding scene lights. GPU resources belong to this instance. */
export function cx30Lights(root:Object3D,model='cx30') {
  const lens=new SphereGeometry(.045,8,6);
  const amber=new MeshBasicMaterial({color:'#ff9d23',toneMapped:false});
  const sides=(['L','R'] as const).map(side=>{
    const lamp=new SpotLight(0xfff2de,5,38,Math.PI/7,.35);
    lamp.visible=false; lamp.target.position.set(0,-.22,8);
    const socket=root.getObjectByName('HEADLIGHT_'+side);
    if(socket)socket.add(lamp,lamp.target);
    else {
      const head=positions[model as keyof typeof positions]?.head;
      const asset=vehicleAsset(model);
      if(head && asset) {
        lamp.position.set((side==='L'?-1:1)*head[0],head[1]-asset.size[1]/2,head[2]);
        lamp.target.position.add(lamp.position);root.add(lamp,lamp.target);
      }
    }
    const marker=(name:string,material:MeshBasicMaterial)=>{
      const dot=new Mesh(lens,material);dot.visible=false;
      root.getObjectByName(name)?.add(dot);return dot;
    };
    return {side,lamp,markers:[marker('TURN_F'+side,amber),marker('TURN_R'+side,amber)]};
  });
  return {
    update(mask:number,high:boolean,blink:boolean) {
      for (const {side,lamp,markers} of sides) {
        applyHeadlightBeam(lamp,hasFlag(mask,VehicleFlags.HEADLIGHTS)||high,high);
        const signal=hasFlag(mask,VehicleFlags.HAZARDS)||hasFlag(mask,side==='L'?VehicleFlags.BLINKER_LEFT:VehicleFlags.BLINKER_RIGHT);
        markers[0].visible=markers[1].visible=signal&&blink;
      }
    },
    dispose() {
      for(const {lamp,markers} of sides){lamp.removeFromParent();lamp.target.removeFromParent();lamp.dispose();for(const dot of markers)dot.removeFromParent();}
      lens.dispose();amber.dispose();
    },
  };
}
