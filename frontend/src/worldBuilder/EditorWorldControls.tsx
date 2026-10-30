import {useBuilderStore} from './builderStore';
import {switchBuilderWorld} from './builderActions';
import {mapCatalog} from '../store/worldCatalog';
import {EDITOR_THEMES,useEditorPreferences,type EditorTheme} from './editorPreferences';
import type {DetailPreference} from './vehicles/vehicleCatalog';

export function EditorWorldControls({compact=false}:{compact?:boolean}){
 const source=useBuilderStore(s=>s.doc),loading=useBuilderStore(s=>s.loadingMap),preferences=useEditorPreferences();
 const worlds=source&&!mapCatalog.some(m=>m.id===source.map_id)?[...mapCatalog,{id:source.map_id,name:source.map_id,desc:''}]:mapCatalog;
 return <div className={`le-world-controls${compact?' is-compact':''}`}>
  <label className="le-header-field le-world-field"><span>Editing world</span><select aria-label="Editing world" aria-busy={Boolean(loading)} value={loading??source?.map_id??''} onChange={e=>void switchBuilderWorld(e.target.value)}>
   {!source&&!loading&&<option value="" disabled>Choose world</option>}{worlds.map(world=><option key={world.id} value={world.id}>{world.name}</option>)}
  </select></label>
  {!compact&&<><label className="le-header-field"><span>Editor style</span><select aria-label="Editor theme" value={preferences.theme} onChange={e=>preferences.setTheme(e.target.value as EditorTheme)}>{Object.entries(EDITOR_THEMES).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}</select></label>
  <label className="le-header-field le-detail-field"><span>Detail / LOD</span><select aria-label="Editor detail" value={preferences.detail} onChange={e=>preferences.setDetail(e.target.value as DetailPreference)}><option value="auto">Auto</option><option value="low">Low</option><option value="high">High</option></select></label></>}
 </div>;
}
