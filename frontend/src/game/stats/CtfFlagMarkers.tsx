import {minimapContacts} from '../../ui/Minimap/minimapContacts';
import {Html} from '@react-three/drei';
import {useNetworkStore} from '../../store/session/networkStore';

/** Render authored bases and live flag positions from the server. Touching the
 * visual is never a capture request; the server checks the actual rigid body. */
export function CtfFlagMarkers(){
 const snapshot=useNetworkStore(s=>s.snapshot),playerId=useNetworkStore(s=>s.playerId);
 const match=snapshot?.match_state;
 const labelledCarriers=new Set([playerId,...minimapContacts(snapshot,playerId).map(contact=>contact.id)]);
 if(!match)return null;
 return <group>{match.flags.map(flag=>{
  const color=flag.team==='red'?'#ff5d78':'#4bc9ff';
  return <group key={flag.team}>
   <mesh position={[flag.base[0],flag.base[1]-.6,flag.base[2]]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[2.6,3,32]}/><meshBasicMaterial color={color} transparent opacity={.65} depthWrite={false}/></mesh>
   <group position={[flag.position[0],flag.position[1]+1.1,flag.position[2]]}>
    <mesh position={[0,1.2,0]}><cylinderGeometry args={[.045,.045,2.4,6]}/><meshBasicMaterial color="#e8edf3"/></mesh>
    <mesh position={[.6,1.9,0]}><boxGeometry args={[1.2,.7,.04]}/><meshBasicMaterial color={color}/></mesh>
    {(flag.status!=='carried'||flag.carrier!==null&&labelledCarriers.has(flag.carrier))&&<Html position={[0,2.8,0]} center distanceFactor={65} style={{pointerEvents:'none',color,whiteSpace:'nowrap',font:'bold 11px system-ui',textShadow:'0 1px 3px #000'}}>{flag.team.toUpperCase()} FLAG · {flag.status.toUpperCase()}</Html>}
   </group>
  </group>;
 })}</group>;
}
