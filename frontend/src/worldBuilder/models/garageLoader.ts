import {DRACOLoader,GLTFLoader} from 'three-stdlib';
const decoder=new DRACOLoader().setDecoderPath('/draco/');
// A private loader prevents simultaneous road/preview loads from replacing the
// garage's decoder configuration with another asset's shared GLTF settings.
export class GarageGLTFLoader extends GLTFLoader {
 constructor(){super();this.setDRACOLoader(decoder);}
}
