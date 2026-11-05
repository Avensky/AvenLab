import type {LayoutObject, LayoutPart} from '../document/layoutDocument';
import {modelAsset, newModel} from './modelCatalog';
import {layoutAction, useLayoutStore} from '../state/layoutStore';

const enclosed: LayoutPart[] = [
  {shape:'box',position:[-.48,.5,0],size:[.04,1,1]},
  {shape:'box',position:[.48,.5,0],size:[.04,1,1]},
  {shape:'box',position:[0,.5,-.48],size:[1,1,.04]},
  {shape:'box',position:[0,.97,0],size:[1,.06,1]},
];
export function ServiceGarageControls({item}: {item: LayoutObject}) {
  const update=useLayoutStore(s=>s.update);
  return <fieldset disabled={item.locked}><label>Service
    <select value={item.piece} onChange={e=>layoutAction(()=>update({piece:e.target.value}))}>
      <option value="fuel-station">Fuel</option><option value="repair-shop">Repair</option><option value="service-center">Fuel and repair</option>
    </select></label><label>Garage entrance
    <select value={item.model?'wide':'enclosed'} onChange={e=>layoutAction(()=>update(e.target.value==='wide'
        ? {model:newModel(modelAsset('selection_garage')!),parts:[]} : {model:undefined,parts:structuredClone(enclosed)}))}>
      <option value="wide">Two-wall GLB · wide entries</option><option value="enclosed">Three walls · front entry</option>
    </select></label></fieldset>;
}
