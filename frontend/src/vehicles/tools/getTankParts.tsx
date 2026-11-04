import {createTankForwardGun} from './tankForwardGun';
import {createTankHatches} from './tankHatches';
import {measureBarrelTip} from '../../combat/weaponVisuals';
import { Box3, Group, Object3D, Vector3 } from 'three';

/** Uploaded modular tank has baked vertex positions and sibling meshes.
 * Preserve their world transforms while adding real yaw/elevation pivots.
 * The non-modular export is a duplicate whole tank, not the collision hull. */
export function getTankParts(scene: Group) {
  for (const name of ['Tank_Body_Non_Modular','Hatch_Front_Hatch_Hull','Empty']) {
    const mesh=scene.getObjectByName(name);if(mesh)mesh.visible=false;
  }
  scene.updateMatrixWorld(true);
  const turret=new Group();turret.name='Tank_TurretYaw';turret.position.set(0,1.30,.10);scene.add(turret);
  scene.updateMatrixWorld(true);
  for(const name of ['Turret','TurretBasket','Interior_TurretBasket','Hatch_Small','Hatch_Small2','Hatch_Hull']) {
    const mesh=scene.getObjectByName(name);if(mesh)turret.attach(mesh);
  }
  const hatches=createTankHatches(scene,turret);
  const cannon=new Group();cannon.name='Tank_CannonPitch';cannon.position.set(0,.35,.95);turret.add(cannon);
  const recoil=new Group();recoil.name='Tank_CannonRecoil';cannon.add(recoil);
  scene.updateMatrixWorld(true);
  for(const name of ['Cannon','Breech']){const mesh=scene.getObjectByName(name);if(mesh)recoil.attach(mesh);}
  const muzzle=new Group();muzzle.name='Tank_CannonMuzzle';
  const barrel=scene.getObjectByName('Cannon');
  muzzle.position.copy(barrel?measureBarrelTip(barrel,recoil):new Vector3(0,0,4.1));recoil.add(muzzle);
  // The existing roof machine gun is baked into Turret, opposite Hatch_Hull.
  // Right side is -X with this model's +Z forward. Tip measured from the GLB:
  // (-.505, 2.2, 1.406), plus .035 m forward clearance for the flash.
  const coax=new Group();coax.name='Tank_CoaxMuzzle';coax.position.set(-.505,.90,1.341);turret.add(coax);
  const forwardGun=createTankForwardGun(scene,turret);
  const wheels: Object3D[]=[];
  for(const name of ['Roadwheel_R5','Roadwheel_L5','Roadwheel_R4','Roadwheel_L4','Roadwheel_R3','Roadwheel_L3','Roadwheel_L2_R2','Roadwheel_L1_R1']) {
    const mesh=scene.getObjectByName(name);if(!mesh)continue;
    const center=new Box3().setFromObject(mesh).getCenter(new Vector3());
    const pivot=new Group();pivot.name=`${name}_Axle`;pivot.position.copy(center);scene.add(pivot);scene.updateMatrixWorld(true);pivot.attach(mesh);wheels.push(pivot);
  }
  return {hull:scene.getObjectByName('Hull'),turret,cannon,recoil,wheels,muzzle,coax,forwardGun,hatches};
}
