// Preserve the kit's UVs while keeping the original 70k-triangle cart out of the driving scene.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {weld,simplify,draco,prune} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import codecs from 'draco3dgltf';
import {fileURLToPath} from 'node:url';
import {rename} from 'node:fs/promises';
const target=new URL('../public/models/world/harbor-street-props.glb',import.meta.url);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder':await codecs.createEncoderModule(),'draco3d.decoder':await codecs.createDecoderModule(),
});
const doc=await io.read(fileURLToPath(target));await MeshoptSimplifier.ready;
await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.055,error:.008}),prune(),draco());
const temporary=new URL('street-props-'+process.pid+'.glb',target);
await io.write(fileURLToPath(temporary),doc);await rename(temporary,target);
