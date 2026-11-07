import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('vehicle catalog browser mirror matches its authored public manifest',()=>{
  const source=readFileSync(new URL('../public/models/vehicles/catalog.json',import.meta.url));
  const generated=readFileSync(new URL('../src/vehicles/generated/assetCatalog.json',import.meta.url));
  assert.equal(Buffer.compare(source,generated),0);
  const check=spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/sync-vehicle-asset-catalog.mjs',import.meta.url)),'--check'],{encoding:'utf8'});
  assert.equal(check.status,0,check.stdout+check.stderr);
});

test('browser source never imports files from Vite public as JavaScript modules',()=>{
  const root=new URL('../src/',import.meta.url);
  for(const path of readdirSync(root,{recursive:true}).filter(p=>/\.[cm]?[jt]sx?$/.test(p))){
    const text=readFileSync(new URL(path.replaceAll('\\','/'),root),'utf8');
    assert.doesNotMatch(text,/(?:from\s*|import\s*\(?\s*)["'][^"'\n]*\bpublic\//,path);
  }
});
