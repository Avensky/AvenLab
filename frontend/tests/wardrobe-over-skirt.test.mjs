import assert from 'node:assert/strict';
import test from 'node:test';
import { BufferGeometry, Float32BufferAttribute, Group, SkinnedMesh } from 'three';
import { createServer } from 'vite';

test('over-skirt ease flares the lower hem without changing its straps or tucked geometry', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareWardrobe } = await vite.ssrLoadModule('/src/game/characters/wardrobe.ts');
    const source = new BufferGeometry();
    source.setAttribute('position', new Float32BufferAttribute([.14, 1.02, .025, .12, 1.125, .025, .11, 1.35, .025], 3));
    source.setAttribute('normal', new Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0], 3));
    source.setAttribute('uv', new Float32BufferAttribute([0, 0, .5, .5, 1, 1], 2));
    source.setAttribute('skinWeight', new Float32BufferAttribute([1, 0, 0, 0, .8, .2, 0, 0, 1, 0, 0, 0], 4));
    source.setAttribute('_aven_coverage', new Float32BufferAttribute([0, 0, 0], 1));
    source.setIndex([0, 1, 2]);
    const root = new Group();
    const over = new SkinnedMesh(source), tucked = new SkinnedMesh(source);
    over.name = 'CLOTH_CORSET_OVER';
    over.userData.wardrobeRole = 'corset-over';
    tucked.name = 'CLOTH_CORSET_TUCKED';
    tucked.userData.wardrobeRole = 'corset-tucked';
    root.add(over, tucked);
    const wardrobe = prepareWardrobe(root);
    const set = { set: 'gothic-04', shirt: 'none', waist: 'over' };
    wardrobe.apply(set);
    const defaultOver = over.geometry;
    const defaultTucked = tucked.geometry;
    const position = defaultOver.getAttribute('position');
    let roomier;
    for (const [level, added] of [[1, .012], [2, .024]]) {
      wardrobe.apply(set, level);
      const widened = over.geometry.getAttribute('position');
      assert(Math.abs(widened.getX(0) - position.getX(0) - added) < 1e-6);
      assert(Math.abs(widened.getX(1) - position.getX(1) - added / 2) < 1e-6);
      assert.deepEqual(widened.array.slice(6), position.array.slice(6), 'shoulder and strap positions are unchanged');
      assert.deepEqual(over.geometry.getAttribute('uv').array, defaultOver.getAttribute('uv').array);
      assert.deepEqual(over.geometry.getAttribute('skinWeight').array, defaultOver.getAttribute('skinWeight').array);
      assert.deepEqual(over.geometry.getIndex().array, defaultOver.getIndex().array);
      assert.deepEqual(over.geometry.drawRange, defaultOver.drawRange);
      assert.equal(tucked.geometry, defaultTucked);
      if (level === 1) roomier = over.geometry;
    }
    wardrobe.apply(set, 1);
    assert.equal(over.geometry, roomier, 'each ease level reuses its own geometry');
    wardrobe.apply({ ...set, waist: 'tucked' }, 2);
    assert.equal(tucked.visible, true);
    assert.equal(over.visible, false);
    assert.equal(over.geometry, defaultOver);
    wardrobe.apply(set);
    assert.equal(over.geometry, defaultOver);
    wardrobe.dispose();
    assert.equal(over.geometry, source);
    assert.equal(tucked.geometry, source);
    source.dispose();
  } finally {
    await vite.close();
  }
});
