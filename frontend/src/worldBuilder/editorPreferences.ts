import {create} from 'zustand';
import {persist} from 'zustand/middleware';
export type EditorTheme='navy'|'hacker'|'forest';
export const EDITOR_THEMES={
 navy:{label:'Dark navy',background:'#050c18',panel:'#0b1729',raised:'#10233a',line:'#719bd532',text:'#e6efff',muted:'#94a9c5',accent:'#75acff',physical:'#4de0b0',grid:'#1b3652',axis:'#547cac',floor:'#10213a'},
 hacker:{label:'Hacker blue',background:'#04151d',panel:'#092531',raised:'#0c3542',line:'#3ccdeb35',text:'#d8f6ff',muted:'#82bacb',accent:'#30d5ff',physical:'#39eea6',grid:'#19485a',axis:'#38a8ba',floor:'#0d3040'},
 forest:{label:'Forest',background:'#101c16',panel:'#1a2e24',raised:'#233f30',line:'#b5d39c30',text:'#e7edda',muted:'#a2b59a',accent:'#b8d49e',physical:'#65dfb0',grid:'#304c39',axis:'#8ba879',floor:'#23382b'},
} as const;
type Preferences={theme:EditorTheme;chunkGuide:boolean;setTheme:(theme:EditorTheme)=>void;setChunkGuide:(value:boolean)=>void};
export const useEditorPreferences=create<Preferences>()(persist((set)=>({theme:'navy',chunkGuide:false,setTheme:theme=>{if(theme in EDITOR_THEMES)set({theme});},setChunkGuide:chunkGuide=>set({chunkGuide})}),{name:'avenlab-world-editor-preferences-v1',partialize:s=>({theme:s.theme,chunkGuide:s.chunkGuide}),merge:(stored,current)=>{const value=stored as Partial<Preferences>|null;return {...current,...(value?.theme&&value.theme in EDITOR_THEMES?{theme:value.theme}:{}),...(typeof value?.chunkGuide==='boolean'?{chunkGuide:value.chunkGuide}:{})};}}));
