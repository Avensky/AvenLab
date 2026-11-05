import {useEffect,useRef,useState} from 'react';
import {useFrame} from '@react-three/fiber';
import type {Group,Mesh} from 'three';
import {PieceModel} from '../../worldBuilder/scene/LayoutMeshes';
import type {LayoutObject,WorldLayout} from '../../worldBuilder/document/layoutDocument';
import {useNetworkStore} from '../../store/session/networkStore';
import {bridgeAngle} from './bridgeMotion';

type Fall={item:LayoutObject;key:number;start:number;angle:number};
const canFall=(o:LayoutObject)=>['canal-lift','highway-guardrail','downtown-metal-barrier'].includes(o.piece);
function DebrisPiece({fall,layout}:{fall:Fall;layout:WorldLayout}){
  const root=useRef<Group>(null),ring=useRef<Mesh>(null);
  const {item}=fall;
  const lift=item.piece==='canal-lift';
  // Perimeter rails are on the dry side of the quay. Include the short
  // outward travel to find the water surface they actually fall into.
  const water = layout.objects.find(o => o.piece === 'coastal-water-visual' &&
    Math.abs(o.position[0]-item.position[0]) <= o.size[0]/2 + 5 &&
    Math.abs(o.position[2]-item.position[2]) <= o.size[2]/2 + 5);
  const waterfront = Boolean(water) && (lift || item.piece === 'highway-guardrail');
  const surface = water ? water.position[1] + water.size[1] : item.position[1];
  const impact=(1.7+Math.sqrt(1.7**2+2*9.81*Math.max(0,item.position[1]-surface)))/9.81;
  useFrame(()=>{
    const o=root.current;if(!o)return;
    const t=Math.max(0,(performance.now()-fall.start)/1000);
    let dx=0,dz=0;
    if(item.id.startsWith('boarding-rail')) dz=Math.sign(item.position[2]);
    else if(item.id.startsWith('perimeter-rail')){
      // Orient away from the city center, perpendicular to this edge.
      const a=item.yaw*Math.PI/180, nx=Math.sin(a),nz=Math.cos(a);
      const sign=Math.sign((item.position[0]-258)*nx+(item.position[2]-439)*nz)||1;
      dx=sign*nx;dz=sign*nz;
    }else if(!lift){
      if(Math.abs(item.position[2])>285)dz=Math.sign(item.position[2]);
      else dx=(Math.abs(item.position[0])<40?-1:1)*Math.sign(item.position[0]);
    }
    const drop=1.7*t-4.905*t*t;
    o.position.set(item.position[0]+dx*3*t,item.position[1]+(waterfront?drop:Math.max(-.44,drop)),item.position[2]+dz*3*t);
    o.rotation.order='YXZ';o.rotation.y=item.yaw*Math.PI/180;
    o.rotation.x=lift?0:Math.min(t*1.65,1.52);
    o.rotation.z=lift?fall.angle-Math.min(t*1.35,1.5):.10*Math.sin(3*t);
    if(ring.current){
      const age=t-impact;
      ring.current.visible=waterfront && age>=0 && age<.72;
      if(ring.current.visible){
        const x=item.position[0]+dx*3*impact+(lift?(item.yaw===0?1:-1)*item.size[0]*.38:0);
        ring.current.position.set(x,surface+.01,item.position[2]+dz*3*impact);
        ring.current.scale.setScalar((lift?2.4:1.1)*(.3+age*3.2));
      }
    }
  });
  return <><group ref={root} position={item.position}>
    <group scale={item.size}><PieceModel item={item}/></group>
  </group><mesh ref={ring} visible={false} rotation={[-Math.PI/2,0,0]}>
    <ringGeometry args={[.78,1,24]}/><meshBasicMaterial color="#a4c2c7" transparent opacity={.55} depthWrite={false}/>
  </mesh></>;
}

export function HarborDebris({layout,destroyed}:{layout:WorldLayout;destroyed:string}){
  const prev=useRef<{layout:WorldLayout;id:number|undefined;ids:Set<string>}|null>(null);
  const serial=useRef(0);
  const [falls,setFalls]=useState<Fall[]>([]);
  useEffect(()=>{
    const snap=useNetworkStore.getState().snapshot;
    const ids=new Set(destroyed.split('|').filter(Boolean)),old=prev.current;
    const id=useNetworkStore.getState().room_id??undefined;
    if(!snap){prev.current=null;setFalls([]);return;}
    prev.current={layout,id,ids};
    // Joining a damaged world starts with its confirmed gap.
    if(!old||old.layout!==layout||old.id!==id){setFalls([]);return;}
    const start=performance.now();
    const added=layout.objects.filter(o=>ids.has(o.id)&&!old.ids.has(o.id)&&canFall(o)).map(item=>({
      item,key:++serial.current,start,angle:bridgeAngle(snap.tick,snap.drawbridge),
    }));
    setFalls(current=>[...current.filter(f=>ids.has(f.item.id)),...added].slice(-16));
  },[layout,destroyed]);
  useEffect(()=>{
    if(!falls.length)return;
    const remaining=3400-(performance.now()-falls[0].start);
    const timer=setTimeout(()=>setFalls(current=>current.filter(f=>performance.now()-f.start<3400)),Math.max(5,remaining));
    return ()=>clearTimeout(timer);
  },[falls]);
  return <>{falls.map(f=><DebrisPiece key={f.key} fall={f} layout={layout}/>)}</>;
}
