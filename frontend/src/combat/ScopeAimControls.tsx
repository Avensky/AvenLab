import {useEffect} from 'react';
import {useThree} from '@react-three/fiber';
import {bindScopedAimDrag} from './scopeAim';

/** Mounted only by the scope rig; chase drag unmounts while this owner aims. */
export function ScopeAimControls(){
 const gl=useThree(state=>state.gl);
 useEffect(()=>bindScopedAimDrag(gl.domElement),[gl]);
 return null;
}
