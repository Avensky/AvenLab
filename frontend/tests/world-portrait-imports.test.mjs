import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'vite';

test('portrait component resolves independently on a case-insensitive filesystem and exports its UI',async()=>{
 const folder='src/game/preview',modules=fs.readdirSync(folder).filter(p=>/\.(?:ts|tsx|js|jsx)$/.test(p));
 const names=new Map();
 for(const file of modules){const key=file.replace(/\.(?:ts|tsx|js|jsx)$/,'').toLowerCase();assert(!names.has(key),`Windows module collision: ${names.get(key)} and ${file}`);names.set(key,file);}
 const source=fs.readFileSync('src/game/alpha/ModeSelection.tsx','utf8');assert.match(source,/from ['"]\.\.\/preview\/WorldPortraitCard['"]/);
 assert(fs.existsSync(folder+'/environmentPortrait.css'));
 assert.match(fs.readFileSync('src/styleImports.d.ts','utf8'),/declare module "\*\.css"/);
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
 try{const component=await vite.ssrLoadModule('/src/game/preview/WorldPortraitCard.tsx');assert.equal(typeof component.WorldPortraitCard,'function');const helper=await vite.ssrLoadModule('/src/game/preview/worldPreviewGeometry.ts');assert.equal(typeof helper.worldPreviewShapes,'function');}finally{await vite.close();}
});
